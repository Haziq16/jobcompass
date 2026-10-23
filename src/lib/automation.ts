import { authorizedAutomaticApplication } from "./swipe-application-consent";
import { applicationProgress } from "./application-progress";
import { resolvedApplicationReadiness } from "./application-readiness";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db, authDb } from "./db";
import { inWorkspace, workspaceId } from "./workspace-context";
import { AppError } from "./contracts";
import {
  automationSettingsSchema,
  submissionRequest,
  outcomeSchema,
  fillTarget,
  targetInfo,
} from "./application-fill-contracts";
import { getCandidate } from "./application-memory";
import { ownedCvSource } from "./cv-source";
import { startFill, canUseFilling } from "./application-filling";
import { updateStudioApplication } from "./studio-application";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const automationDefaults = {
  enabled: false,
  submit: true,
  resumeAssetId: "",
  country: "",
  platforms: ["greenhouse", "lever", "ashby"],
  dailyLimit: 3,
  monthlyLimit: 30,
  consent: true,
};
export function canUseAutomation(
  user?: { email: string },
  env: Record<string, string | undefined> = process.env,
) {
  if (env.AUTOMATION_MODE === "off") return false;
  if (!canUseFilling(user, env)) return false;
  return (
    env.APP_ACCESS === "local" ||
    (!!user &&
      user.email.toLowerCase() === env.OWNER_EMAIL?.trim().toLowerCase())
  );
}
export function workerAuthorized(headers: Headers) {
  const expected = process.env.AUTOMATION_WORKER_SECRET || "",
    actual = headers.get("authorization")?.replace(/^Bearer /, "") || "";
  return (
    expected.length >= 32 &&
    actual.length === expected.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  );
}
async function event(kind: string, message: string, taskId?: string) {
  return db.automationEvent.create({
    data: { workspaceId: workspaceId(), kind, message, taskId },
  });
}
async function lock(tx: Pick<Prisma.TransactionClient, "$executeRaw">) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"autopilot:" + workspaceId()},0))`;
}
export async function automationOverview() {
  await reconcileAutomation();
  const [settings, tasks, events, submissions, resumes] = await Promise.all([
    db.automationSettings.findUnique({ where: { workspaceId: workspaceId() } }),
    db.automationTask.findMany({ orderBy: { updatedAt: "desc" }, take: 50 }),
    db.automationEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.applicationSubmission.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        catalogId: true,
        state: true,
        evidence: true,
        revision: true,
        createdAt: true,
      },
    }),
    db.resumeAsset.findMany({
      select: { id: true, name: true },
      take: 40,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const ids = tasks.map((t) => t.catalogId);
  const sessions = await db.applicationFillSession.findMany({
    where: {
      id: { in: tasks.flatMap((t) => (t.sessionId ? [t.sessionId] : [])) },
    },
    select: { id: true, report: true },
  });
  const now = new Date(),
    day = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ),
    month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [today, monthly, preparationBlocked, heartbeat] = await Promise.all([
    db.automationEvent.count({
      where: { kind: "lease", createdAt: { gte: day } },
    }),
    db.automationEvent.count({
      where: { kind: "lease", createdAt: { gte: month } },
    }),
    db.automationEvent.count({
      where: { kind: "preparation_blocked", createdAt: { gte: month } },
    }),
    db.automationEvent.findFirst({
      where: { kind: "worker_heartbeat" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, message: true },
    }),
  ]);
  const decisions = await db.matchDecision.findMany({
    where: { catalogId: { in: ids } },
    select: { catalogId: true, snapshot: true, state: true },
  });
  const workerActive =
    !!heartbeat && now.getTime() - heartbeat.createdAt.getTime() < 120000;
  return {
    settings: settings
      ? { ...automationDefaults, ...(settings.values as object) }
      : automationDefaults,
    revision: settings?.revision || 0,
    tasks: tasks.map(({ leaseHash, ...t }) => {
      void leaseHash;
      const snap = decisions.find((d) => d.catalogId === t.catalogId)
        ?.snapshot as { title?: string; employer?: string } | undefined;
      return {
        ...t,
        title: snap?.title || "Queued job",
        employer: snap?.employer || "",
        progress: applicationProgress(
          sessions.find((s) => s.id === t.sessionId)?.report,
        ),
        decisionState:
          decisions.find((d) => d.catalogId === t.catalogId)?.state || null,
      };
    }),
    events: events.filter((e) => e.kind !== "worker_heartbeat"),
    usage: { today, monthly, preparationBlocked },
    worker: {
      active: workerActive,
      lastSeen: heartbeat?.createdAt || null,
      description: workerActive
        ? heartbeat!.message
        : "No recent fast-worker heartbeat. Scheduled fallback checks approximately every 30 minutes.",
    },
    submissions,
    resumes,
    workerConfigured: (process.env.AUTOMATION_WORKER_SECRET || "").length >= 32,
    schedule:
      "Existing catalogue scheduler, approximately every 30 minutes; GitHub can delay runs.",
  };
}
export async function recordWorkerHeartbeat(mode: "local" | "scheduled") {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const user = owner
    ? await authDb.user.findUnique({
        where: { email: owner },
        select: { id: true, email: true },
      })
    : null;
  if (!user || !canUseAutomation(user))
    throw new AppError("automation_unavailable", 403);
  return inWorkspace(user.id, () =>
    db.$transaction(async (tx) => {
      await lock(tx);
      const old = await tx.automationEvent.findFirst({
        where: { kind: "worker_heartbeat" },
        orderBy: { createdAt: "desc" },
      });
      const data = {
        message:
          mode === "local"
            ? "Fast local worker: checks every five seconds while this computer is awake and online."
            : "Scheduled cloud worker: this run is active; future runs may be delayed.",
        createdAt: new Date(),
        seenAt: new Date(),
      };
      if (old) await tx.automationEvent.update({ where: { id: old.id }, data });
      else
        await tx.automationEvent.create({
          data: { workspaceId: user.id, kind: "worker_heartbeat", ...data },
        });
      return { ok: true };
    }),
  );
}
export async function saveAutomation(
  input: unknown,
  expectedRevision: number,
  includeExisting = false,
) {
  const values = automationSettingsSchema.parse(input);
  if (values.enabled) {
    if ((process.env.AUTOMATION_WORKER_SECRET || "").length < 32)
      throw new AppError("worker_not_configured", 409);
    const profile = await getCandidate();
    if (!profile.sections.some((s) => s.section === "contact" && s.confirmed))
      throw new AppError("confirmed_contact_required", 409);
    const cv = await ownedCvSource(values.resumeAssetId);
    if (!/\.(pdf|docx)$/i.test(cv.name) || cv.bytes.length > 2 * 1024 * 1024)
      throw new AppError("cv_under_2mb_required", 400);
  }
  const result = await db.$transaction(async (tx) => {
    await lock(tx);
    const old = await tx.automationSettings.findUnique({
      where: { workspaceId: workspaceId() },
    });
    if ((old?.revision || 0) !== expectedRevision)
      throw new AppError("revision_conflict", 409);
    const result = await tx.automationSettings.upsert({
      where: { workspaceId: workspaceId() },
      create: { workspaceId: workspaceId(), values: json(values) },
      update: { values: json(values), revision: { increment: 1 } },
    });
    if (!values.enabled) {
      await tx.automationTask.updateMany({
        where: { state: { in: ["queued", "leased", "needs_input"] } },
        data: {
          state: "cancelled",
          leaseHash: null,
          leaseUntil: null,
          detail: "Paused by the account holder.",
          revision: { increment: 1 },
        },
      });
    }
    await tx.automationEvent.create({
      data: {
        workspaceId: workspaceId(),
        kind: "settings",
        message: values.enabled
          ? "Automatic queue processing enabled with explicit application rules."
          : "Automatic queue processing paused. Already-started submissions remain subject to outcome checks.",
      },
    });
    return result;
  });
  if (values.enabled && includeExisting) {
    const queued = await db.matchDecision.findMany({
      where: { state: "queued" },
      select: { catalogId: true },
      take: 200,
    });
    for (const q of queued) await enqueueAutomation(q.catalogId);
  }
  return { revision: result.revision };
}
export async function enqueueAutomation(catalogId: string) {
  const settings = await db.automationSettings.findUnique({
    where: { workspaceId: workspaceId() },
  });
  if (!settings) return { enqueued: false };
  const values = automationSettingsSchema.parse(settings.values);
  if (!values.enabled) return { enqueued: false };
  const decision = await db.matchDecision.findUnique({
    where: { workspaceId_catalogId: { workspaceId: workspaceId(), catalogId } },
  });
  if (decision?.state !== "queued") return { enqueued: false };
  if (
    !(await authorizedAutomaticApplication(
      decision,
      values.resumeAssetId,
      values.submit,
    ))
  )
    return { enqueued: false, needsAuthorization: true };
  const info = targetInfo(decision.applyUrl);
  if (!info || !values.platforms.includes(info.platform))
    return { enqueued: false };
  return db.$transaction(async (tx) => {
    await lock(tx);
    const old = await tx.automationTask.findUnique({
      where: {
        workspaceId_identity: {
          workspaceId: workspaceId(),
          identity: info.identity,
        },
      },
    });
    if (old) return { enqueued: true, id: old.id, state: old.state };
    const job = await tx.catalogJob.findUnique({
      where: { id: catalogId },
      select: { country: true },
    });
    const task = await tx.automationTask.create({
      data: {
        workspaceId: workspaceId(),
        catalogId,
        identity: info.identity,
        targetUrl: decision.applyUrl,
        country: job?.country || values.country,
        resumeAssetId: values.resumeAssetId,
        submit: values.submit,
      },
    });
    await tx.automationEvent.create({
      data: {
        workspaceId: workspaceId(),
        taskId: task.id,
        kind: "queued",
        message: "A deliberately queued job was added to automatic processing.",
      },
    });
    return { enqueued: true, id: task.id, state: task.state };
  });
}
export async function retryAutomation(id: string) {
  const task = await db.automationTask.findUnique({ where: { id } });
  if (!task) throw new AppError("not_found", 404);
  if (
    await db.applicationSubmission.count({
      where: {
        identity: task.identity,
        state: { not: "resolved_not_submitted" },
      },
    })
  )
    throw new AppError("submission_requires_resolution", 409);
  if (!["needs_input", "failed", "filled", "cancelled"].includes(task.state))
    throw new AppError("task_not_retryable", 409);
  const setting = await db.automationSettings.findUnique({
    where: { workspaceId: workspaceId() },
  });
  if (!setting || !automationSettingsSchema.parse(setting.values).enabled)
    throw new AppError("automation_paused", 409);
  const config = automationSettingsSchema.parse(setting.values);
  const decision = await db.matchDecision.findUnique({
    where: {
      workspaceId_catalogId: {
        workspaceId: workspaceId(),
        catalogId: task.catalogId,
      },
    },
  });
  if (decision?.state !== "queued") throw new AppError("queue_required", 409);
  if (
    !(await authorizedAutomaticApplication(
      decision,
      config.resumeAssetId,
      config.submit,
    ))
  )
    throw new AppError("recipient_authorization_required", 409);
  const catalog = await authDb.catalogJob.findUnique({
    where: { id: task.catalogId },
  });
  if (!catalog) throw new AppError("listing_unavailable", 409);
  const readiness = await resolvedApplicationReadiness(
    catalog,
    task.catalogId,
    true,
  );
  if (readiness.status !== "compatible")
    throw new AppError(
      readiness.status === "incompatible"
        ? "eligibility_conflict"
        : "eligibility_confirmation_required",
      409,
    );
  await db.automationTask.update({
    where: { id, revision: task.revision },
    data: {
      resumeAssetId: config.resumeAssetId,
      submit: config.submit,
      state: "queued",
      leaseHash: null,
      leaseUntil: null,
      detail: null,
      revision: { increment: 1 },
    },
  });
  await event(
    "retry",
    "A pre-submission task was explicitly returned to the queue.",
    id,
  );
  return { ok: true };
}
export async function reconcileAutomation() {
  const stale = await db.applicationSubmission.findMany({
    where: {
      state: "submitting",
      updatedAt: { lt: new Date(Date.now() - 5 * 60000) },
    },
  });
  for (const s of stale) {
    const changed = await db.applicationSubmission.updateMany({
      where: { id: s.id, state: "submitting" },
      data: { state: "uncertain", revision: { increment: 1 } },
    });
    if (changed.count) {
      await db.automationTask.updateMany({
        where: { identity: s.identity },
        data: {
          state: "uncertain",
          detail:
            "The worker stopped after submission permission was reserved. No automatic retry.",
          leaseHash: null,
          leaseUntil: null,
          revision: { increment: 1 },
        },
      });
      await event(
        "uncertain",
        "A submission may have reached the employer. Check its outcome; it will not be retried.",
      );
    }
  }
  const expired = await db.automationTask.findMany({
    where: { state: "leased", leaseUntil: { lt: new Date() } },
  });
  for (const t of expired) {
    const submission = await db.applicationSubmission.findUnique({
      where: {
        workspaceId_identity: {
          workspaceId: workspaceId(),
          identity: t.identity,
        },
      },
    });
    const attempts = await db.automationEvent.count({
      where: { taskId: t.id, kind: { in: ["lease", "preparation_blocked"] } },
    });
    await db.automationTask.updateMany({
      where: { id: t.id, state: "leased", revision: t.revision },
      data: {
        state: submission ? "uncertain" : attempts < 3 ? "queued" : "failed",
        detail: submission
          ? "Submission outcome needs resolution."
          : "Worker interrupted before submission; lease recovered.",
        leaseHash: null,
        leaseUntil: null,
        revision: { increment: 1 },
      },
    });
  }
}
export async function reserveSubmission(id: string, input: unknown) {
  const request = submissionRequest.parse(input),
    session = await db.applicationFillSession.findUnique({ where: { id } });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    !session.submissionAllowed
  )
    throw new AppError("submission_not_authorized", 403);
  if (session.taskId) {
    const setting = await db.automationSettings.findUnique({
      where: { workspaceId: workspaceId() },
    });
    if (!setting) throw new AppError("automation_paused", 409);
    const values = automationSettingsSchema.parse(setting.values);
    if (!values.enabled || !values.submit)
      throw new AppError("submission_not_authorized", 403);
    const approvedDecision = await db.matchDecision.findUnique({
      where: {
        workspaceId_catalogId: {
          workspaceId: workspaceId(),
          catalogId: session.catalogId,
        },
      },
    });
    if (
      !approvedDecision ||
      !(await authorizedAutomaticApplication(
        approvedDecision,
        session.resumeAssetId,
        true,
      ))
    )
      throw new AppError("recipient_authorization_required", 403);
  }
  const profile = await getCandidate();
  if (profile.revision !== session.profileRevision)
    throw new AppError("profile_changed", 409);
  const report = session.report as {
    fingerprint?: string;
    auditClean?: boolean;
    uploadVerified?: boolean;
    requiredMissing?: number;
    blockers?: unknown[];
  } | null;
  if (
    session.state !== "filled" ||
    !report?.auditClean ||
    !report.uploadVerified ||
    report.requiredMissing ||
    report.blockers?.length ||
    report.fingerprint !== request.fingerprint
  )
    throw new AppError("verified_form_required", 409);
  const decision = await db.matchDecision.findUnique({
    where: {
      workspaceId_catalogId: {
        workspaceId: workspaceId(),
        catalogId: session.catalogId,
      },
    },
  });
  if (decision?.state !== "queued") throw new AppError("queue_required", 409);
  const identity = fillTarget(session.targetUrl);
  if (!identity) throw new AppError("unsupported_form", 400);
  const prepared = await updateStudioApplication(
    "catalog",
    session.catalogId,
    "prepare",
  );
  const applicationId = prepared.application?.id;
  if (!applicationId) throw new AppError("prepare_first", 409);
  return db.$transaction(async (tx) => {
    await lock(tx);
    const app = await tx.application.findUniqueOrThrow({
      where: { id: applicationId },
    });
    if (!["Saved", "Preparing"].includes(app.status))
      throw new AppError("already_applied", 409);
    const old = await tx.applicationSubmission.findUnique({
      where: { workspaceId_identity: { workspaceId: workspaceId(), identity } },
    });
    if (old && old.state !== "resolved_not_submitted")
      throw new AppError("duplicate_submission_blocked", 409);
    const submission = old
      ? await tx.applicationSubmission.update({
          where: { id: old.id, revision: old.revision },
          data: {
            sessionId: id,
            state: "submitting",
            fingerprint: request.fingerprint,
            evidence: Prisma.DbNull,
            revision: { increment: 1 },
          },
        })
      : await tx.applicationSubmission.create({
          data: {
            workspaceId: workspaceId(),
            identity,
            catalogId: session.catalogId,
            sessionId: id,
            applicationId,
            state: "submitting",
            fingerprint: request.fingerprint,
          },
        });
    if (session.taskId)
      await tx.automationTask.updateMany({
        where: { id: session.taskId, state: "leased" },
        data: { state: "submitting", revision: { increment: 1 } },
      });
    await tx.automationEvent.create({
      data: {
        workspaceId: workspaceId(),
        taskId: session.taskId,
        kind: "submitting",
        message:
          "One submission was authorized for the verified form. Replays will be refused.",
      },
    });
    return {
      submissionId: submission.id,
      revision: submission.revision,
      permission: "one_click",
    };
  });
}
export async function recordOutcome(sessionId: string, input: unknown) {
  const data = outcomeSchema.parse(input),
    session = await db.applicationFillSession.findUnique({
      where: { id: sessionId },
    });
  if (!session) throw new AppError("not_found", 404);
  if (
    data.outcome === "confirmed" &&
    (data.proof !== "platform_confirmation" ||
      !/thank you for (applying|your application)|application (has been |was )?(successfully )?(submitted|received)|we.ve received your application/i.test(
        data.marker,
      ) ||
      fillTarget(data.url) !== fillTarget(session.targetUrl))
  )
    throw new AppError("receipt_required", 409);
  if (data.outcome === "failed" && data.proof !== "validation_rejection")
    throw new AppError("rejection_required", 409);
  return db.$transaction(async (tx) => {
    await lock(tx);
    const old = await tx.applicationSubmission.findUnique({
      where: { id: data.submissionId },
    });
    if (!old || old.sessionId !== sessionId)
      throw new AppError("not_found", 404);
    if (old.state === data.outcome) return { state: old.state };
    if (!["submitting", "uncertain"].includes(old.state))
      throw new AppError("outcome_already_recorded", 409);
    await tx.applicationSubmission.update({
      where: { id: old.id, revision: old.revision },
      data: {
        state: data.outcome,
        evidence: json({
          proof: data.proof,
          url: data.url,
          marker: data.marker,
          source: "platform_browser_observation",
          at: new Date().toISOString(),
        }),
        revision: { increment: 1 },
      },
    });
    if (data.outcome === "confirmed") {
      await tx.application.update({
        where: { id: old.applicationId },
        data: { status: "Applied", appliedAt: new Date() },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId: old.applicationId,
          status: "Applied",
          kind: "verified_submission",
          message:
            "The adapter observed a platform-specific application confirmation after the authorized submit action.",
          evidence: json({
            submissionId: old.id,
            proof: data.proof,
            marker: data.marker,
          }),
        },
      });
    }
    if (session.taskId)
      await tx.automationTask.updateMany({
        where: { id: session.taskId },
        data: {
          state: data.outcome,
          detail: data.marker || "No reliable receipt; no automatic retry.",
          leaseHash: null,
          leaseUntil: null,
          revision: { increment: 1 },
        },
      });
    await tx.automationEvent.create({
      data: {
        workspaceId: workspaceId(),
        taskId: session.taskId,
        kind: data.outcome,
        message:
          data.outcome === "confirmed"
            ? "Employer confirmation observed. Application tracker updated."
            : data.outcome === "failed"
              ? "Employer validation rejected the application. Review the form; no automatic resubmission."
              : "Submission result is uncertain. Check the employer before retrying.",
      },
    });
    return { state: data.outcome };
  });
}
export async function resolveSubmission(
  id: string,
  revision: number,
  submitted: boolean,
) {
  return db.$transaction(async (tx) => {
    await lock(tx);
    const row = await tx.applicationSubmission.findUnique({ where: { id } });
    if (!row) throw new AppError("not_found", 404);
    if (
      row.revision !== revision ||
      !["failed", "uncertain"].includes(row.state)
    )
      throw new AppError("revision_conflict", 409);
    await tx.applicationSubmission.update({
      where: { id, revision },
      data: {
        state: submitted ? "confirmed" : "resolved_not_submitted",
        evidence: json({
          source: "account_holder_resolution",
          submitted,
          at: new Date().toISOString(),
        }),
        revision: { increment: 1 },
      },
    });
    if (submitted) {
      await tx.application.update({
        where: { id: row.applicationId },
        data: { status: "Applied", appliedAt: new Date() },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId: row.applicationId,
          status: "Applied",
          kind: "manual",
          message:
            "Account holder checked and confirmed a previously uncertain submission.",
        },
      });
    }
    await tx.automationTask.updateMany({
      where: { identity: row.identity },
      data: {
        state: submitted ? "confirmed" : "needs_input",
        detail: submitted
          ? "Outcome confirmed by the account holder."
          : "Account holder confirmed no application was submitted. Explicit retry is now available.",
        revision: { increment: 1 },
      },
    });
    return { ok: true };
  });
}
export async function claimAutomationForWorkspace() {
  await reconcileAutomation();
  return db.$transaction(async (tx) => {
    await lock(tx);
    const setting = await tx.automationSettings.findUnique({
      where: { workspaceId: workspaceId() },
    });
    if (!setting) return null;
    const config = automationSettingsSchema.parse(setting.values);
    if (!config.enabled) return null;
    const now = new Date(),
      day = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      ),
      month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [today, monthly] = await Promise.all([
      tx.automationEvent.count({
        where: { kind: "lease", createdAt: { gte: day } },
      }),
      tx.automationEvent.count({
        where: { kind: "lease", createdAt: { gte: month } },
      }),
    ]);
    if (today >= config.dailyLimit || monthly >= config.monthlyLimit)
      return null;
    const task = await tx.automationTask.findFirst({
      where: { state: "queued" },
      orderBy: { createdAt: "asc" },
    });
    if (!task) return null;
    const platform = targetInfo(task.targetUrl)?.platform;
    if (!platform || !config.platforms.includes(platform)) {
      await tx.automationTask.update({
        where: { id: task.id },
        data: {
          state: "cancelled",
          detail: "Platform removed from the current application rules.",
          revision: { increment: 1 },
        },
      });
      return null;
    }
    const token = randomBytes(32).toString("base64url");
    await tx.automationTask.update({
      where: { id: task.id, revision: task.revision },
      data: {
        state: "leased",
        submit: task.submit && config.submit,
        leaseHash: hash(token),
        leaseUntil: new Date(Date.now() + 5 * 60000),
        revision: { increment: 1 },
      },
    });
    const leaseEvent = await tx.automationEvent.create({
      data: {
        workspaceId: workspaceId(),
        taskId: task.id,
        kind: "lease",
        message:
          "Offline worker claimed one task within the configured daily and monthly limits.",
      },
    });
    return {
      task: { ...task, submit: task.submit && config.submit },
      leaseToken: token,
      leaseEventId: leaseEvent.id,
    };
  });
}
export async function claimAutomation() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!email || process.env.AUTOMATION_MODE === "off") return null;
  const user = await authDb.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user || !canUseAutomation(user)) return null;
  return inWorkspace(user.id, async () => {
    const leased = await claimAutomationForWorkspace();
    if (!leased) return null;
    try {
      const decision = await db.matchDecision.findUnique({
        where: {
          workspaceId_catalogId: {
            workspaceId: workspaceId(),
            catalogId: leased.task.catalogId,
          },
        },
      });
      if (
        !decision ||
        !(await authorizedAutomaticApplication(
          decision,
          leased.task.resumeAssetId,
          leased.task.submit,
        ))
      )
        throw new AppError("recipient_authorization_required", 409);
      const grant = await startFill({
        catalogId: leased.task.catalogId,
        resumeAssetId: leased.task.resumeAssetId,
        country: leased.task.country,
        submit: leased.task.submit,
        consent: true,
      });
      await db.applicationFillSession.update({
        where: { id: grant.id },
        data: { taskId: leased.task.id },
      });
      await db.automationTask.update({
        where: { id: leased.task.id },
        data: { sessionId: grant.id },
      });
      return { taskId: leased.task.id, leaseToken: leased.leaseToken, grant };
    } catch (e) {
      await db.$transaction(async (tx) => {
        await tx.automationTask.update({
          where: { id: leased.task.id },
          data: {
            state: "needs_input",
            detail:
              e instanceof AppError
                ? e.code
                : "Preparation failed before submission.",
            leaseHash: null,
            leaseUntil: null,
            revision: { increment: 1 },
          },
        });
        // No worker received the grant: retain the attempt audit without charging
        // the daily/monthly browser-processing allowance. A successfully issued
        // grant, CAPTCHA, uncertain result or browser failure still counts.
        await tx.automationEvent.updateMany({
          where: {
            id: leased.leaseEventId,
            taskId: leased.task.id,
            kind: "lease",
          },
          data: {
            kind: "preparation_blocked",
            message:
              "Preparation stopped before a worker received CV access; no application quota used.",
          },
        });
      });
      await event(
        "needs_input",
        "An offline task needs profile, CV, queue or source attention before it can start.",
        leased.task.id,
      );
      return null;
    }
  });
}
export async function workerPending() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!email) return false;
  const user = await authDb.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user || !canUseAutomation(user)) return false;
  return inWorkspace(user.id, async () => {
    await reconcileAutomation();
    const setting = await db.automationSettings.findUnique({
      where: { workspaceId: workspaceId() },
    });
    if (!setting || !automationSettingsSchema.parse(setting.values).enabled)
      return false;
    const config = automationSettingsSchema.parse(setting.values),
      now = new Date(),
      day = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      ),
      month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return (
      (await db.automationEvent.count({
        where: { kind: "lease", createdAt: { gte: day } },
      })) < config.dailyLimit &&
      (await db.automationEvent.count({
        where: { kind: "lease", createdAt: { gte: month } },
      })) < config.monthlyLimit &&
      (await db.automationTask.count({ where: { state: "queued" } })) > 0
    );
  });
}
export async function withWorkerLease<T>(
  taskId: string,
  token: string,
  action: (sessionId: string) => Promise<T>,
  receipt = false,
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new AppError("invalid_lease", 401);
  const task = await authDb.automationTask.findUnique({
    where: { id: taskId },
  });
  if (
    !task ||
    task.leaseHash !== hash(token) ||
    !task.leaseUntil ||
    task.leaseUntil < new Date() ||
    !task.sessionId ||
    !["leased", "submitting"].includes(task.state)
  )
    throw new AppError("invalid_lease", 401);
  const user = await authDb.user.findUnique({
    where: { id: task.workspaceId },
    select: { email: true },
  });
  if (!canUseAutomation(user || undefined))
    throw new AppError("automation_unavailable", 403);
  return inWorkspace(task.workspaceId, async () => {
    const setting = await db.automationSettings.findUnique({
      where: { workspaceId: workspaceId() },
    });
    if (
      !receipt &&
      (!setting || !automationSettingsSchema.parse(setting.values).enabled)
    )
      throw new AppError("automation_paused", 409);
    if (!receipt) {
      const approvedDecision = await db.matchDecision.findUnique({
        where: {
          workspaceId_catalogId: {
            workspaceId: workspaceId(),
            catalogId: task.catalogId,
          },
        },
      });
      if (
        !approvedDecision ||
        !(await authorizedAutomaticApplication(
          approvedDecision,
          task.resumeAssetId,
          task.submit,
        ))
      )
        throw new AppError("recipient_authorization_required", 403);
    }
    return action(task.sessionId!);
  });
}
export async function finishAutomation(sessionId: string, error?: string) {
  const session = await db.applicationFillSession.findUnique({
    where: { id: sessionId },
  });
  if (!session?.taskId) throw new AppError("not_found", 404);
  const submission = await db.applicationSubmission.findUnique({
    where: {
      workspaceId_identity: {
        workspaceId: workspaceId(),
        identity: fillTarget(session.targetUrl)!,
      },
    },
  });
  const state = submission
    ? submission.state === "submitting"
      ? "uncertain"
      : submission.state === "resolved_not_submitted"
        ? "needs_input"
        : submission.state
    : session.state === "filled" && !session.submissionAllowed
      ? "filled"
      : "needs_input";
  await db.automationTask.update({
    where: { id: session.taskId },
    data: {
      state,
      detail:
        error ||
        (!submission && session.submissionAllowed
          ? "Form or submission needs attention. Open the job to resolve required answers or CAPTCHA."
          : null),
      leaseHash: null,
      leaseUntil: null,
      revision: { increment: 1 },
    },
  });
  await event(
    state,
    error || "Offline processing finished. Check this task's form report.",
    session.taskId,
  );
  return { state };
}
