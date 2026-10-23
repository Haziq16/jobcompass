import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { db, authDb } from "./db";
import { inWorkspace, workspaceId } from "./workspace-context";
import { AppError } from "./contracts";
import { getCandidate, lookupApplicationAnswer } from "./application-memory";
import { ownedCvSource } from "./cv-source";
import { canUseMatches } from "./match-access";
import {
  startFillSchema,
  scanSchema,
  reportSchema,
  fillTarget,
  questionLabel,
  normalChoice,
  exactOption,
  type FillField,
  companionId,
} from "./application-fill-contracts";
const json = (v: unknown) => JSON.parse(JSON.stringify(v));
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function canUseFilling(
  user?: { email: string },
  env: Record<string, string | undefined> = process.env,
) {
  return (
    canUseMatches(user, env) &&
    canUseMatches(user, { ...env, MATCH_MODE: env.FILL_MODE || "owner" })
  );
}
export async function fillSetup(catalogId: string) {
  const decision = await db.matchDecision.findUnique({
    where: { workspaceId_catalogId: { workspaceId: workspaceId(), catalogId } },
  });
  if (!decision) throw new AppError("not_found", 404);
  const [profile, resumes, sessions] = await Promise.all([
    getCandidate(),
    db.resumeAsset.findMany({
      select: { id: true, name: true, isDefault: true, createdAt: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      take: 40,
    }),
    db.applicationFillSession.findMany({
      where: { catalogId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        state: true,
        report: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true,
        revision: true,
      },
    }),
  ]);
  return {
    decision: {
      catalogId,
      title: (decision.snapshot as { title: string }).title,
      employer: (decision.snapshot as { employer: string }).employer,
      targetUrl: decision.applyUrl,
      state: decision.state,
    },
    supported: Boolean(fillTarget(decision.applyUrl)),
    profileReady: profile.sections.some(
      (s) => s.section === "contact" && s.confirmed,
    ),
    profileRevision: profile.revision,
    resumes,
    sessions,
    companionId,
  };
}
export async function startFill(input: unknown) {
  const data = startFillSchema.parse(input);
  const setup = await fillSetup(data.catalogId);
  if (setup.decision.state !== "queued")
    throw new AppError("queue_required", 409);
  if (!setup.supported) throw new AppError("unsupported_form", 400);
  if (!setup.profileReady)
    throw new AppError("confirmed_contact_required", 409);
  const catalog = await authDb.catalogJob.findUnique({
    where: { id: data.catalogId },
    include: { board: true },
  });
  if (
    !catalog?.active ||
    !catalog.board.enabled ||
    !catalog.board.lastSuccessAt ||
    catalog.board.lastSuccessAt.valueOf() < Date.now() - 48 * 3600000 ||
    fillTarget(catalog.applyUrl) !== fillTarget(setup.decision.targetUrl)
  )
    throw new AppError("listing_unavailable", 409);
  const cv = await ownedCvSource(data.resumeAssetId);
  if (!/\.(pdf|docx)$/i.test(cv.name) || cv.bytes.length > 2 * 1024 * 1024)
    throw new AppError("cv_under_2mb_required", 400);
  const token = randomBytes(32).toString("base64url");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"fill:" + workspaceId() + ":" + data.catalogId},0))`;
    await tx.applicationFillSession.updateMany({
      where: { catalogId: data.catalogId, revokedAt: null },
      data: { revokedAt: new Date(), state: "revoked" },
    });
    const session = await tx.applicationFillSession.create({
      data: {
        workspaceId: workspaceId(),
        catalogId: data.catalogId,
        targetUrl: setup.decision.targetUrl,
        resumeAssetId: cv.id,
        resumeHash: cv.sha256,
        profileRevision: setup.profileRevision,
        country: data.country,
        grantHash: hash(token),
        expiresAt: new Date(Date.now() + 30 * 60000),
      },
    });
    return {
      id: session.id,
      token,
      targetUrl: session.targetUrl,
      expiresAt: session.expiresAt,
      companionId,
    };
  });
}
export async function withFillGrant<T>(
  token: string,
  targetUrl: string,
  action: (id: string) => Promise<T>,
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new AppError("invalid_grant", 401);
  const session = await authDb.applicationFillSession.findUnique({
    where: { grantHash: hash(token) },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    !fillTarget(targetUrl) ||
    fillTarget(targetUrl) !== fillTarget(session.targetUrl)
  )
    throw new AppError("invalid_grant", 401);
  const user = await authDb.user.findUnique({
    where: { id: session.workspaceId },
    select: { email: true },
  });
  if (!canUseFilling(user || undefined))
    throw new AppError("filling_unavailable", 403);
  return inWorkspace(session.workspaceId, async () => {
    const profile = await getCandidate();
    if (profile.revision !== session.profileRevision)
      throw new AppError("profile_changed", 409);
    const decision = await db.matchDecision.findUnique({
      where: {
        workspaceId_catalogId: {
          workspaceId: workspaceId(),
          catalogId: session.catalogId,
        },
      },
    });
    if (decision?.state !== "queued") throw new AppError("queue_required", 409);
    return action(session.id);
  });
}
async function sessionFor(id: string) {
  const row = await db.applicationFillSession.findUnique({ where: { id } });
  if (!row || row.revokedAt || row.expiresAt <= new Date())
    throw new AppError("invalid_grant", 401);
  return row;
}
async function answerField(
  f: FillField,
  catalogId: string,
  country: string,
  profile: Awaited<ReturnType<typeof getCandidate>>,
) {
  const question = questionLabel(f.label || f.name);
  if (!question)
    return {
      status: "needs_input",
      reason: "Unlabelled control; choose manually.",
    };
  if (!f.empty)
    return {
      status: "preserved",
      reason: "Existing value preserved; check it on the employer form.",
    };
  if (["checkbox", "unsupported"].includes(f.kind))
    return {
      status: "needs_input",
      reason: "This control requires your action.",
    };
  if (f.kind === "file")
    return /^(?:(?:upload|attach)(?: your)? )?(?:resume|cv|curriculum vitae)(?:\b|$)/i.test(
      normalChoice(question),
    ) &&
      !/\b(cover|transcript|certificate|other)\b/.test(normalChoice(question))
      ? { status: "file", reason: "Selected original CV." }
      : {
          status: "needs_input",
          reason: "Choose the correct document manually.",
        };
  const contact = profile.sections.find(
    (s) => s.section === "contact",
  )?.confirmed;
  const direct: Record<string, string> = {
    "first name": profile.values.contact.firstName,
    "given name": profile.values.contact.firstName,
    "last name": profile.values.contact.lastName,
    "family name": profile.values.contact.lastName,
    surname: profile.values.contact.lastName,
    "full name": profile.values.contact.name,
    name: profile.values.contact.name,
    email: profile.values.contact.email,
    "email address": profile.values.contact.email,
    phone: profile.values.contact.phone,
    "phone number": profile.values.contact.phone,
    linkedin: profile.values.contact.linkedin,
    "linkedin profile": profile.values.contact.linkedin,
    "linkedin profile url": profile.values.contact.linkedin,
    website: profile.values.contact.portfolio,
    portfolio: profile.values.contact.portfolio,
    "current location": profile.values.contact.location,
  };
  const value = contact ? direct[normalChoice(question)] : null;
  let lookup: Awaited<ReturnType<typeof lookupApplicationAnswer>> | null = null;
  if (!value) {
    try {
      lookup = await lookupApplicationAnswer({
        question: question.length >= 3 ? question : "Field " + question,
        context: { catalogId, country },
        createMissing: true,
      });
    } catch (e) {
      if (e instanceof AppError && e.code === "question_country_mismatch")
        return {
          status: "needs_input",
          reason:
            "This question names a different country. Check the job country and start a fresh connection.",
        };
      throw e;
    }
  }
  const answer = value || lookup?.answer?.answer;
  if (!answer)
    return {
      status: "needs_input",
      reason:
        lookup?.message || "Confirm this fact in your application profile.",
      questionId: lookup?.questionId,
    };
  if (["select", "radio"].includes(f.kind)) {
    const selected = exactOption(answer, f.options);
    return selected !== null
      ? {
          status: "fill",
          value: selected,
          reason: value
            ? "Confirmed contact detail"
            : "Confirmed answer memory",
        }
      : {
          status: "needs_input",
          reason:
            "The saved answer does not match exactly one available option.",
          questionId: lookup?.questionId,
        };
  }
  return {
    status: "fill",
    value: answer,
    reason: value
      ? "Confirmed contact detail"
      : lookup?.answer?.source || "Confirmed answer",
  };
}
export async function planFill(id: string, input: unknown) {
  const scan = scanSchema.parse(input),
    session = await sessionFor(id);
  const profile = await getCandidate();
  if (profile.revision !== session.profileRevision)
    throw new AppError("profile_changed", 409);
  const cv = await ownedCvSource(
    session.resumeAssetId,
    undefined,
    session.resumeHash,
  );
  const fields = [];
  for (let offset = 0; offset < scan.fields.length; offset += 5) {
    fields.push(
      ...(await Promise.all(
        scan.fields.slice(offset, offset + 5).map(async (field) => ({
          id: field.id,
          label: questionLabel(field.label || field.name),
          required: field.required,
          ...(await answerField(
            field,
            session.catalogId,
            session.country,
            profile,
          )),
        })),
      )),
    );
  }
  if ((await getCandidate()).revision !== session.profileRevision)
    throw new AppError("profile_changed", 409);
  const fingerprint = hash(scan);
  const updated = await db.applicationFillSession.updateMany({
    where: { id, revision: session.revision, revokedAt: null },
    data: {
      scanHash: fingerprint,
      scan: json(scan),
      state: "filling",
      revision: { increment: 1 },
      report: Prisma.DbNull,
    },
  });
  if (!updated.count) throw new AppError("revision_conflict", 409);
  return {
    scanHash: fingerprint,
    revision: session.revision + 1,
    fields,
    blockers: scan.blockers,
    document: fields.some((f) => f.status === "file")
      ? {
          filename: cv.name,
          mime: cv.name.toLowerCase().endsWith(".pdf")
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          base64: cv.bytes.toString("base64"),
          sha256: cv.sha256,
        }
      : null,
  };
}
export async function reportFill(id: string, input: unknown) {
  const data = reportSchema.parse(input),
    session = await sessionFor(id);
  if (session.scanHash !== data.scanHash || session.revision !== data.revision)
    throw new AppError("revision_conflict", 409);
  const scan = scanSchema.parse(session.scan);
  if (
    data.results.length !== scan.fields.length ||
    new Set(data.results.map((r) => r.id)).size !== data.results.length ||
    scan.fields.some((f) => !data.results.some((r) => r.id === f.id))
  )
    throw new AppError("incomplete_report", 400);
  const required = scan.fields.filter((f) => f.required);
  const missing = required.filter(
    (f) =>
      !data.results.some(
        (r) => r.id === f.id && ["filled", "preserved"].includes(r.status),
      ),
  );
  const state =
    data.blockers.length || scan.blockers.length || missing.length
      ? "needs_input"
      : "filled";
  const report = {
    ...data,
    results: data.results.map((r) => ({
      ...r,
      label: scan.fields.find((f) => f.id === r.id)?.label || r.id,
    })),
    filled: data.results.filter((r) => r.status === "filled").length,
    preserved: data.results.filter((r) => r.status === "preserved").length,
    requiredMissing: missing.length,
    submission: "not_submitted",
  };
  const result = await db.applicationFillSession.updateMany({
    where: { id, revision: data.revision, revokedAt: null },
    data: { state, report: json(report), revision: { increment: 1 } },
  });
  if (!result.count) throw new AppError("revision_conflict", 409);
  return { state, report };
}
export async function revokeFill(id: string) {
  const result = await db.applicationFillSession.updateMany({
    where: { id, revokedAt: null },
    data: {
      state: "revoked",
      revokedAt: new Date(),
      revision: { increment: 1 },
    },
  });
  if (!result.count) throw new AppError("not_found", 404);
  return { ok: true };
}
