import {
  swipeApplicationContext,
  swipeApplicationConsent,
  verifySwipeApplicationConsent,
} from "../src/lib/swipe-application-consent";
import { decideMatch } from "../src/lib/matches";
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { authDb } from "../src/lib/db";
import { inWorkspace } from "../src/lib/workspace-context";
import { emptyCandidate } from "../src/lib/application-memory-contracts";
import { saveCandidate } from "../src/lib/application-memory";
import { saveCvSource } from "../src/lib/cv-source";
import { cvLayoutFixture } from "../scripts/cv-layout-fixture.mjs";
import {
  startFill,
  planFill,
  reportFill,
} from "../src/lib/application-filling";
import { targetInfo } from "../src/lib/application-fill-contracts";
import {
  saveAutomation as rawSaveAutomation,
  enqueueAutomation,
  claimAutomation,
  automationOverview,
  reserveSubmission,
  recordOutcome,
  resolveSubmission,
  retryAutomation,
  workerPending,
  withWorkerLease,
  canUseAutomation,
  workerAuthorized,
  reconcileAutomation,
} from "../src/lib/automation";
if (
  process.env.JOBCOMPASS_TEST !== "true" ||
  !process.env.DATABASE_URL?.includes("/jobcompass_test")
)
  throw new Error("Isolated test database only");
const run = <T>(f: () => Promise<T>, who = "alice") => inWorkspace(who, f);
let cvId: string;
const catalogId = "c".repeat(64),
  target = "https://job-boards.greenhouse.io/automation-fixture/jobs/123";
const config = (extra = {}) => ({
  enabled: true,
  submit: true,
  resumeAssetId: cvId,
  country: "Singapore",
  platforms: ["greenhouse", "lever", "ashby"],
  dailyLimit: 3,
  monthlyLimit: 30,
  consent: true,
  ...extra,
});
async function consentFixture(id: string) {
  const job = await authDb.catalogJob.findUniqueOrThrow({ where: { id } });
  const consent = await run(async () =>
    swipeApplicationConsent(job, await swipeApplicationContext()),
  );
  if (!consent) return;
  const row = await authDb.matchDecision.findUniqueOrThrow({
    where: { workspaceId_catalogId: { workspaceId: "alice", catalogId: id } },
  });
  const applicationAuthorization = await run(() =>
    verifySwipeApplicationConsent(consent.token, job),
  );
  await authDb.matchDecision.update({
    where: { id: row.id },
    data: {
      snapshot: { ...(row.snapshot as object), applicationAuthorization },
    },
  });
}
async function saveAutomation(
  input: unknown,
  revision: number,
  includeExisting = false,
) {
  const result = await rawSaveAutomation(input, revision, false);
  const config = input as { enabled: boolean };
  if (config.enabled) {
    const rows = await authDb.matchDecision.findMany({
      where: { workspaceId: "alice", state: "queued" },
    });
    for (const row of rows) {
      if (
        !(row.snapshot as { applicationAuthorization?: unknown })
          .applicationAuthorization
      )
        await consentFixture(row.catalogId);
      if (includeExisting) await enqueueAutomation(row.catalogId);
    }
  }
  return result;
}
async function seed(id = catalogId, url = target) {
  await authDb.catalogJob.create({
    data: {
      id,
      boardId: "automation-fixture",
      providerId: "automation:" + id,
      title: "Kotlin Engineer",
      employer: "Fictional Labs",
      location: "Singapore",
      country: "Singapore",
      description: "Build Kotlin systems.",
      sourceUrl: url,
      applyUrl: url,
      hash: "fixture",
      searchText: "Kotlin Engineer",
    },
  });
  await authDb.matchDecision.create({
    data: {
      workspaceId: "alice",
      catalogId: id,
      providerId: "automation:" + id,
      applyUrl: url,
      state: "queued",
      snapshot: {
        title: "Kotlin Engineer",
        employer: "Fictional Labs",
        applyUrl: url,
      },
    },
  });
  await consentFixture(id);
}
async function ready(
  submit = true,
  existing?: Awaited<ReturnType<typeof startFill>>,
) {
  const grant =
    existing ||
    (await run(() =>
      startFill({
        catalogId,
        resumeAssetId: cvId,
        country: "Singapore",
        consent: true,
        submit,
      }),
    ));
  const scan = await run(() =>
    planFill(grant.id, {
      fields: [
        {
          id: "first",
          label: "First name",
          name: "first_name",
          kind: "text",
          required: true,
          empty: true,
          options: [],
          accept: "",
        },
      ],
    }),
  );
  const fingerprint = "a".repeat(64);
  await run(() =>
    reportFill(grant.id, {
      scanHash: scan.scanHash,
      revision: scan.revision,
      results: [
        { id: "first", status: "filled", reason: "Fixture value retained" },
      ],
      blockers: [],
      fingerprint,
      uploadVerified: true,
      auditClean: true,
    }),
  );
  return { ...grant, fingerprint };
}
beforeEach(async () => {
  process.env.APP_ACCESS = "local";
  process.env.OWNER_EMAIL = "owner@automation.example";
  process.env.AUTOMATION_WORKER_SECRET = "fixture-worker-secret-".repeat(3);
  delete process.env.AUTOMATION_MODE;
  delete process.env.FILL_MODE;
  await authDb.$executeRawUnsafe(
    'TRUNCATE "AutomationSettings","AutomationTask","AutomationEvent","ApplicationSubmission","ApplicationFillSession","CandidateProfile","ApplicationAnswer","ApplicationQuestion","MatchDecision","MatchAction","CatalogBoard","ResumeAsset","User","Job","Profile","Settings" CASCADE',
  );
  await authDb.user.create({
    data: {
      id: "alice",
      name: "Fixture Owner",
      email: process.env.OWNER_EMAIL,
    },
  });
  await authDb.catalogBoard.create({
    data: {
      id: "automation-fixture",
      platform: "greenhouse",
      token: "automation-fixture",
      name: "Fictional Labs",
      lastSuccessAt: new Date(),
      initialIndexedAt: new Date(),
    },
  });
  await seed();
  cvId = (
    await run(async () =>
      saveCvSource(await cvLayoutFixture(), "automation-original.docx"),
    )
  ).sourceDocument.id;
  const v = structuredClone(emptyCandidate);
  v.contact = {
    ...v.contact,
    name: "Alex Example",
    firstName: "Alex",
    lastName: "Example",
    email: "alex@example.test",
  };
  await run(() =>
    saveCandidate({
      values: v,
      expectedRevision: 0,
      confirmSections: ["contact"],
    }),
  );
});
after(async () => {
  await authDb.$executeRawUnsafe(
    'TRUNCATE "AutomationSettings","AutomationTask","AutomationEvent","ApplicationSubmission","ApplicationFillSession" CASCADE',
  );
  await authDb.$disconnect();
});
test("three platform targets retain exact job identity and reject forged hosts", () => {
  assert.equal(targetInfo(target)?.platform, "greenhouse");
  const id = randomUUID();
  assert.equal(
    targetInfo("https://jobs.lever.co/example/" + id + "/apply")?.platform,
    "lever",
  );
  assert.equal(
    targetInfo("https://jobs.eu.lever.co/example/" + id)?.platform,
    "lever",
  );
  assert.equal(
    targetInfo("https://jobs.ashbyhq.com/example/" + id + "/application")
      ?.platform,
    "ashby",
  );
  assert.equal(
    targetInfo("https://jobs.ashbyhq.com.evil.test/example/" + id),
    null,
  );
});
test("automation is separately owner-only, switchable off, and worker keys are compared exactly", () => {
  const env = {
    APP_ACCESS: "hosted",
    OWNER_EMAIL: "owner@example.test",
    MATCH_MODE: "all",
    FILL_MODE: "all",
  };
  assert.equal(canUseAutomation({ email: "other@example.test" }, env), false);
  assert.equal(canUseAutomation({ email: "owner@example.test" }, env), true);
  assert.equal(
    canUseAutomation(
      { email: "owner@example.test" },
      { ...env, AUTOMATION_MODE: "off" },
    ),
    false,
  );
  assert.equal(
    workerAuthorized(
      new Headers({
        authorization: "Bearer " + process.env.AUTOMATION_WORKER_SECRET,
      }),
    ),
    true,
  );
  assert.equal(
    workerAuthorized(new Headers({ authorization: "Bearer invalid" })),
    false,
  );
});
test("offline rules require explicit consent and revision, default paused, and do not silently enroll old jobs", async () => {
  assert.equal((await run(automationOverview)).settings.enabled, false);
  await assert.rejects(
    run(() => saveAutomation(config({ consent: false }), 0)),
  );
  await run(() => saveAutomation(config(), 0));
  assert.equal(await authDb.automationTask.count(), 0);
  await assert.rejects(
    run(() => saveAutomation(config(), 0)),
    /revision_conflict/,
  );
  await run(() => enqueueAutomation(catalogId));
  assert.equal(await authDb.automationTask.count(), 1);
});
test("same job queued through another catalogue identity is enrolled once", async () => {
  await run(() => saveAutomation(config(), 0));
  await run(() => enqueueAutomation(catalogId));
  const other = "d".repeat(64);
  await seed(other, target);
  await run(() => enqueueAutomation(other));
  assert.equal(await authDb.automationTask.count(), 1);
  assert.equal((await run(automationOverview, "bob")).tasks.length, 0);
});
test("concurrent claims grant one lease and daily limits stop later jobs", async () => {
  await run(() => saveAutomation(config({ dailyLimit: 1 }), 0, true));
  const claims = await Promise.all([claimAutomation(), claimAutomation()]);
  assert.equal(claims.filter(Boolean).length, 1);
  const task = claims.find(Boolean)!;
  assert.equal(
    await withWorkerLease(task.taskId, task.leaseToken, async () => true),
    true,
  );
  const other = "d".repeat(64);
  await seed(
    other,
    "https://job-boards.greenhouse.io/automation-fixture/jobs/124",
  );
  await run(() => enqueueAutomation(other));
  assert.equal(await workerPending(), false);
  assert.equal(await claimAutomation(), null);
});
test("blocked preparation releases daily and monthly quota while preserving its attempt audit", async () => {
  await run(() =>
    saveAutomation(config({ dailyLimit: 1, monthlyLimit: 1 }), 0, true),
  );
  const decision = await authDb.matchDecision.findFirstOrThrow({
    where: { workspaceId: "alice", catalogId },
  });
  await authDb.matchDecision.update({
    where: { id: decision.id },
    data: {
      snapshot: { title: "Kotlin Engineer", employer: "Fictional Labs" },
    },
  });
  assert.equal(await claimAutomation(), null);
  assert.equal(await authDb.applicationFillSession.count(), 0);
  assert.equal(
    await authDb.automationEvent.count({ where: { kind: "lease" } }),
    0,
  );
  assert.equal(
    await authDb.automationEvent.count({
      where: { kind: "preparation_blocked" },
    }),
    1,
  );
  const other = "d".repeat(64);
  await seed(
    other,
    "https://job-boards.greenhouse.io/automation-fixture/jobs/124",
  );
  await run(() => enqueueAutomation(other));
  assert.equal(await workerPending(), true);
  assert.ok(await claimAutomation());
  assert.equal(await workerPending(), false);
  assert.equal(
    await authDb.automationEvent.count({ where: { kind: "lease" } }),
    1,
  );
  assert.equal(
    await authDb.automationEvent.count({
      where: { kind: "preparation_blocked" },
    }),
    1,
  );
});
test("pausing cancels unsent leases and stops further worker requests", async () => {
  await run(() => saveAutomation(config(), 0, true));
  const task = await claimAutomation();
  assert.ok(task);
  await run(() => saveAutomation(config({ enabled: false }), 1));
  await assert.rejects(
    withWorkerLease(task.taskId, task.leaseToken, async () => true),
    /invalid_lease/,
  );
  assert.equal(
    (
      await authDb.automationTask.findUniqueOrThrow({
        where: { id: task.taskId },
      })
    ).state,
    "cancelled",
  );
});
test("automatic submit needs separate authorization plus a clean current upload and fingerprint", async () => {
  const g = await ready(false);
  await assert.rejects(
    run(() => reserveSubmission(g.id, { fingerprint: g.fingerprint })),
    /submission_not_authorized/,
  );
  const fresh = await ready();
  await assert.rejects(
    run(() => reserveSubmission(fresh.id, { fingerprint: "b".repeat(64) })),
    /verified_form_required/,
  );
  const session = await authDb.applicationFillSession.findUniqueOrThrow({
    where: { id: fresh.id },
  });
  await authDb.applicationFillSession.update({
    where: { id: fresh.id },
    data: { report: { ...(session.report as object), uploadVerified: false } },
  });
  await assert.rejects(
    run(() => reserveSubmission(fresh.id, { fingerprint: fresh.fingerprint })),
    /verified_form_required/,
  );
});
test("concurrent submit permission dispatches once and a click alone never records Applied", async () => {
  const g = await ready();
  const attempts = await Promise.allSettled([
    run(() => reserveSubmission(g.id, { fingerprint: g.fingerprint })),
    run(() => reserveSubmission(g.id, { fingerprint: g.fingerprint })),
  ]);
  assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
  assert.equal(await authDb.applicationSubmission.count(), 1);
  assert.equal(
    (await authDb.application.findFirstOrThrow()).status,
    "Preparing",
  );
});
test("only a known receipt for the same job confirms Applied; arbitrary success text or wrong job fails", async () => {
  const g = await ready(),
    permission = await run(() =>
      reserveSubmission(g.id, { fingerprint: g.fingerprint }),
    );
  await assert.rejects(
    run(() =>
      recordOutcome(g.id, {
        submissionId: permission.submissionId,
        outcome: "confirmed",
        url: target,
        marker: "Button clicked",
        proof: "platform_confirmation",
      }),
    ),
    /receipt_required/,
  );
  await assert.rejects(
    run(() =>
      recordOutcome(g.id, {
        submissionId: permission.submissionId,
        outcome: "confirmed",
        url: target.replace("123", "124"),
        marker: "Application submitted successfully",
        proof: "platform_confirmation",
      }),
    ),
    /receipt_required/,
  );
  await run(() =>
    recordOutcome(g.id, {
      submissionId: permission.submissionId,
      outcome: "confirmed",
      url: target,
      marker: "Application submitted successfully",
      proof: "platform_confirmation",
    }),
  );
  assert.equal((await authDb.application.findFirstOrThrow()).status, "Applied");
  await assert.rejects(
    run(() => reserveSubmission(g.id, { fingerprint: g.fingerprint })),
  );
});
test("uncertain outcomes cannot retry until the account holder explicitly resolves them", async () => {
  await run(() => saveAutomation(config(), 0, true));
  const g = await ready(),
    permission = await run(() =>
      reserveSubmission(g.id, { fingerprint: g.fingerprint }),
    );
  await run(() =>
    recordOutcome(g.id, {
      submissionId: permission.submissionId,
      outcome: "uncertain",
      url: target,
      marker: "No reliable receipt.",
      proof: "no_receipt",
    }),
  );
  const task = await authDb.automationTask.findFirstOrThrow();
  await assert.rejects(
    run(() => retryAutomation(task.id)),
    /submission_requires_resolution/,
  );
  const submission = await authDb.applicationSubmission.findUniqueOrThrow({
    where: { id: permission.submissionId },
  });
  await run(() => resolveSubmission(submission.id, submission.revision, false));
  await run(() => retryAutomation(task.id));
  assert.equal(
    (await authDb.automationTask.findUniqueOrThrow({ where: { id: task.id } }))
      .state,
    "queued",
  );
});
test("expired workers recover before submission but a lost post-click outcome remains uncertain", async () => {
  await run(() => saveAutomation(config(), 0, true));
  const leased = await claimAutomation();
  assert.ok(leased);
  await authDb.automationTask.update({
    where: { id: leased.taskId },
    data: { leaseUntil: new Date(0) },
  });
  await run(reconcileAutomation);
  assert.equal(
    (
      await authDb.automationTask.findUniqueOrThrow({
        where: { id: leased.taskId },
      })
    ).state,
    "queued",
  );
  const g = await ready(),
    p = await run(() =>
      reserveSubmission(g.id, { fingerprint: g.fingerprint }),
    );
  await authDb.applicationSubmission.update({
    where: { id: p.submissionId },
    data: { updatedAt: new Date(0) },
  });
  await run(reconcileAutomation);
  assert.equal(
    (
      await authDb.applicationSubmission.findUniqueOrThrow({
        where: { id: p.submissionId },
      })
    ).state,
    "uncertain",
  );
  assert.equal(
    (await authDb.application.findFirstOrThrow()).status,
    "Preparing",
  );
});

test("removing a platform cancels its queued work before granting browser access", async () => {
  await run(() => saveAutomation(config(), 0, true));
  await run(() => saveAutomation({ ...config(), platforms: ["lever"] }, 1));
  assert.equal(await claimAutomation(), null);
  assert.equal(
    (await authDb.automationTask.findFirstOrThrow()).state,
    "cancelled",
  );
});
test("turning off submission prevents an older queued task from retaining submit permission", async () => {
  await run(() => saveAutomation(config(), 0, true));
  await run(() => saveAutomation({ ...config(), submit: false }, 1));
  const leased = await claimAutomation();
  assert.ok(leased);
  assert.equal(leased.grant.autoSubmit, false);
  assert.equal(
    (
      await authDb.applicationFillSession.findUniqueOrThrow({
        where: { id: leased.grant.id },
      })
    ).submissionAllowed,
    false,
  );
});

test("pause blocks new work but accepts an already-dispatched worker receipt", async () => {
  await run(() => saveAutomation(config(), 0, true));
  const lease = await claimAutomation();
  assert.ok(lease);
  const g = await ready(true, lease.grant);
  const permission = await run(() =>
    reserveSubmission(g.id, { fingerprint: g.fingerprint }),
  );
  await run(() => saveAutomation({ ...config(), enabled: false }, 1));
  await assert.rejects(
    withWorkerLease(lease.taskId, lease.leaseToken, async () => true),
    /automation_paused/,
  );
  await withWorkerLease(
    lease.taskId,
    lease.leaseToken,
    (id) =>
      recordOutcome(id, {
        submissionId: permission.submissionId,
        outcome: "confirmed",
        url: target,
        marker: "Application submitted successfully",
        proof: "platform_confirmation",
      }),
    true,
  );
  assert.equal((await authDb.application.findFirstOrThrow()).status, "Applied");
});

test("enabling automatic rules never grants employer permission to an old queued job", async () => {
  await run(() => rawSaveAutomation(config(), 0, true));
  assert.equal(await authDb.automationTask.count(), 0);
  assert.equal((await run(() => enqueueAutomation(catalogId))).enqueued, false);
});
test("a signed employer-and-CV disclosure makes the named right swipe runnable", async () => {
  await run(() => rawSaveAutomation(config(), 0));
  const job = await authDb.catalogJob.findUniqueOrThrow({
    where: { id: catalogId },
  });
  const consent = await run(async () =>
    swipeApplicationConsent(job, await swipeApplicationContext()),
  );
  assert.ok(consent);
  await run(() =>
    decideMatch({
      requestId: randomUUID(),
      catalogId,
      state: "queued",
      expectedRevision: 1,
      applicationConsent: consent.token,
    }),
  );
  assert.equal(await authDb.automationTask.count(), 1);
  assert.ok(await claimAutomation());
});
test("disclosure tokens reject tampering, another recipient and another account", async () => {
  await run(() => rawSaveAutomation(config(), 0));
  const job = await authDb.catalogJob.findUniqueOrThrow({
    where: { id: catalogId },
  });
  const consent = await run(async () =>
    swipeApplicationConsent(job, await swipeApplicationContext()),
  );
  assert.ok(consent);
  await assert.rejects(
    run(() => verifySwipeApplicationConsent(consent.token + "x", job)),
  );
  await assert.rejects(
    run(() =>
      verifySwipeApplicationConsent(consent.token, {
        ...job,
        id: "f".repeat(64),
      }),
    ),
  );
  await assert.rejects(
    run(() => verifySwipeApplicationConsent(consent.token, job), "bob"),
  );
});
test("profile edits invalidate queued recipient approval before a worker gets CV data", async () => {
  await run(() => saveAutomation(config(), 0, true));
  const p = await authDb.candidateProfile.findUniqueOrThrow({
    where: { workspaceId: "alice" },
  });
  await run(() =>
    saveCandidate({
      values: { ...(p.values as object), skills: ["Kotlin"] },
      expectedRevision: p.revision,
      confirmSections: [],
    }),
  );
  assert.equal(await claimAutomation(), null);
  assert.equal(
    (await authDb.automationTask.findFirstOrThrow()).state,
    "needs_input",
  );
  assert.equal(await authDb.applicationFillSession.count(), 0);
});
test("changing processing rules invalidates a previously displayed swipe disclosure", async () => {
  await run(() => rawSaveAutomation(config(), 0));
  const job = await authDb.catalogJob.findUniqueOrThrow({
    where: { id: catalogId },
  });
  const consent = await run(async () =>
    swipeApplicationConsent(job, await swipeApplicationContext()),
  );
  assert.ok(consent);
  await run(() => rawSaveAutomation(config({ submit: false }), 1));
  await assert.rejects(
    run(() => verifySwipeApplicationConsent(consent.token, job)),
    /application_consent_stale/,
  );
});
test("revoking the per-job approval stops an existing lease before it can request CV data", async () => {
  await run(() => saveAutomation(config(), 0, true));
  const leased = await claimAutomation();
  assert.ok(leased);
  const decision = await authDb.matchDecision.findFirstOrThrow({
    where: { workspaceId: "alice" },
  });
  await authDb.matchDecision.update({
    where: { id: decision.id },
    data: {
      snapshot: { title: "Kotlin Engineer", employer: "Fictional Labs" },
    },
  });
  await assert.rejects(
    withWorkerLease(leased.taskId, leased.leaseToken, async () => true),
    /recipient_authorization_required/,
  );
});
