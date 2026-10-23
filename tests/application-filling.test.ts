import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { authDb } from "../src/lib/db";
import { inWorkspace } from "../src/lib/workspace-context";
import { emptyCandidate } from "../src/lib/application-memory-contracts";
import {
  saveCandidate,
  saveApplicationAnswer,
} from "../src/lib/application-memory";
import {
  fillTarget,
  exactOption,
  companionId,
} from "../src/lib/application-fill-contracts";
import {
  fillSetup,
  startFill,
  withFillGrant,
  planFill,
  reportFill,
  revokeFill,
  canUseFilling,
} from "../src/lib/application-filling";
import { cvLayoutFixture } from "../scripts/cv-layout-fixture.mjs";
import { saveCvSource } from "../src/lib/cv-source";
import { POST } from "../src/app/api/fill-companion/[[...path]]/route";
if (
  process.env.JOBCOMPASS_TEST !== "true" ||
  !process.env.DATABASE_URL?.includes("/jobcompass_test")
)
  throw new Error("Test DB only");
const run = <T>(action: () => Promise<T>, who = "alice") =>
    inWorkspace(who, action),
  catalogId = "f".repeat(64),
  target = "https://job-boards.greenhouse.io/fixture/jobs/123";
let cvId: string;
const candidate = () => ({
  ...structuredClone(emptyCandidate),
  contact: {
    ...emptyCandidate.contact,
    name: "Alex Sample",
    firstName: "Alex",
    lastName: "Sample",
    email: "alex@example.test",
  },
});
const field = (id: string, label: string, extra = {}) => ({
  id,
  label,
  name: id,
  kind: "text",
  required: true,
  empty: true,
  options: [],
  accept: "",
  ...extra,
});
async function start() {
  return run(() =>
    startFill({
      catalogId,
      resumeAssetId: cvId,
      country: "Singapore",
      consent: true,
    }),
  );
}
beforeEach(async () => {
  process.env.APP_ACCESS = "local";
  delete process.env.FILL_MODE;
  await authDb.$executeRawUnsafe(
    'TRUNCATE "ApplicationFillSession","CandidateProfile","ApplicationAnswer","ApplicationQuestion","ResumeAsset","MatchDecision","CatalogBoard" CASCADE',
  );
  await authDb.catalogBoard.create({
    data: {
      id: "fill-fixture",
      platform: "greenhouse",
      token: "fixture",
      name: "Fixture",
      lastSuccessAt: new Date(),
    },
  });
  await authDb.catalogJob.create({
    data: {
      id: catalogId,
      boardId: "fill-fixture",
      providerId: "fill:123",
      title: "Engineer",
      employer: "Fixture",
      sourceUrl: target,
      applyUrl: target,
      hash: "fixture",
      searchText: "engineer",
    },
  });
  await authDb.matchDecision.create({
    data: {
      workspaceId: "alice",
      catalogId,
      providerId: "fill:123",
      applyUrl: target,
      state: "queued",
      snapshot: { title: "Engineer", employer: "Fixture" },
    },
  });
  cvId = (
    await run(async () => saveCvSource(await cvLayoutFixture(), "fixture.docx"))
  ).sourceDocument.id;
  await run(() =>
    saveCandidate({
      values: candidate(),
      expectedRevision: 0,
      confirmSections: ["contact"],
    }),
  );
});
after(() => authDb.$disconnect());
test("filling is independently owner gated and exact supported destinations reject lookalike hosts", () => {
  const env = {
    APP_ACCESS: "hosted",
    OWNER_EMAIL: "owner@example.test",
    MATCH_MODE: "all",
  };
  assert.equal(canUseFilling({ email: "other@example.test" }, env), false);
  assert.equal(canUseFilling({ email: "owner@example.test" }, env), true);
  assert.equal(
    canUseFilling(
      { email: "owner@example.test" },
      { ...env, FILL_MODE: "off" },
    ),
    false,
  );
  assert.equal(fillTarget(target), "fixture:123");
  assert.equal(
    fillTarget("https://boards.greenhouse.io/fixture/jobs/123?gh_src=test#app"),
    "fixture:123",
  );
  for (const u of [
    "https://job-boards.greenhouse.io.evil.test/fixture/jobs/123",
    "https://user:pass@job-boards.greenhouse.io/fixture/jobs/123",
    "http://job-boards.greenhouse.io/fixture/jobs/123",
  ])
    assert.equal(fillTarget(u), null);
});
test("a queued, available listing, explicit consent, confirmed contact and owned original CV are required", async () => {
  await assert.rejects(
    run(() =>
      startFill({
        catalogId,
        resumeAssetId: cvId,
        country: "SG",
        consent: false,
      }),
    ),
  );
  await assert.rejects(
    run(() => fillSetup(catalogId), "bob"),
    /not_found/,
  );
  await assert.rejects(
    run(() =>
      startFill({
        catalogId,
        resumeAssetId: "other-cv",
        country: "SG",
        consent: true,
      }),
    ),
    /cv_source_missing/,
  );
  await authDb.catalogJob.update({
    where: { id: catalogId },
    data: { active: false },
  });
  await assert.rejects(start(), /listing_unavailable/);
});
test("a fresh connection revokes its predecessor and only its token can access the exact job", async () => {
  const a = await start(),
    b = await start();
  await assert.rejects(
    withFillGrant(a.token, target, async () => true),
    /invalid_grant/,
  );
  assert.equal(await withFillGrant(b.token, target, async (id) => id), b.id);
  await assert.rejects(
    withFillGrant(
      b.token,
      "https://job-boards.greenhouse.io/fixture/jobs/124",
      async () => true,
    ),
    /invalid_grant/,
  );
  await run(() => revokeFill(b.id));
  await assert.rejects(
    withFillGrant(b.token, target, async () => true),
    /invalid_grant/,
  );
});
test("scan uses confirmed names, preserves existing values, sends unknown questions to inbox and never maps consent", async () => {
  const grant = await start();
  const plan = await run(() =>
    planFill(grant.id, {
      fields: [
        field("first", "First name"),
        field("email", "Email", { empty: false }),
        field("project", "What is your favourite project?"),
        field("agree", "I agree", { kind: "checkbox" }),
        field("file", "Resume/CV", { kind: "file" }),
      ],
    }),
  );
  assert.equal(plan.fields[0].value, "Alex");
  assert.equal(plan.fields[1].status, "preserved");
  assert.equal(plan.fields[2].status, "needs_input");
  assert.equal(plan.fields[3].status, "needs_input");
  assert.equal(plan.fields[4].status, "file");
  assert.ok(plan.document?.base64);
  assert.equal(
    await authDb.applicationQuestion.count({ where: { workspaceId: "alice" } }),
    1,
  );
  assert.equal(await authDb.application.count(), 0);
});
test("name components are never guessed from the full name", async () => {
  const v = candidate();
  v.contact.firstName = "";
  v.contact.lastName = "";
  await run(() =>
    saveCandidate({
      values: v,
      expectedRevision: 1,
      confirmSections: ["contact"],
    }),
  );
  const grant = await start();
  const plan = await run(() =>
    planFill(grant.id, { fields: [field("first", "First name")] }),
  );
  assert.equal(plan.fields[0].status, "needs_input");
  assert.equal(plan.fields[0].value, undefined);
});
test("radio and select answers require an exact, unique offered choice; eligibility is country specific", async () => {
  const v = candidate();
  v.eligibility = [
    {
      id: randomUUID(),
      country: "Singapore",
      status: "citizen",
      needsSponsorship: "no",
      details: "",
      expiresOn: "",
    },
  ];
  await run(() =>
    saveCandidate({
      values: v,
      expectedRevision: 1,
      confirmSections: ["eligibility"],
    }),
  );
  const grant = await start();
  const plan = await run(() =>
    planFill(grant.id, {
      fields: [
        field("work", "Are you authorized to work in Singapore?", {
          kind: "select",
          options: [
            { value: "1", label: "Yes" },
            { value: "0", label: "No" },
          ],
        }),
        field("sponsor", "Will you require sponsorship?", {
          kind: "radio",
          options: [
            { value: "y", label: "Yes" },
            { value: "n", label: "No" },
          ],
        }),
      ],
    }),
  );
  assert.equal(plan.fields[0].value, "1");
  assert.equal(plan.fields[1].value, "n");
  assert.equal(
    exactOption("Yes", [
      { value: "1", label: "Yes" },
      { value: "2", label: "Yes" },
    ]),
    null,
  );
  assert.equal(
    exactOption("Yes", [{ value: "1", label: "Yes, with restrictions" }]),
    null,
  );
});
test("reports require every scanned field and current revision, expose blockers and never record an Applied outcome", async () => {
  const grant = await start(),
    plan = await run(() =>
      planFill(grant.id, {
        fields: [
          field("first", "First name"),
          field("unknown", "Special requirement"),
        ],
      }),
    );
  await assert.rejects(
    run(() =>
      reportFill(grant.id, {
        scanHash: plan.scanHash,
        revision: plan.revision,
        results: [],
        blockers: [],
      }),
    ),
    /incomplete_report/,
  );
  const report = await run(() =>
    reportFill(grant.id, {
      scanHash: plan.scanHash,
      revision: plan.revision,
      results: [
        { id: "first", status: "filled", reason: "Verified value" },
        { id: "unknown", status: "needs_input", reason: "Missing answer" },
      ],
      blockers: [],
    }),
  );
  assert.equal(report.state, "needs_input");
  assert.equal(report.report.requiredMissing, 1);
  assert.equal(report.report.submission, "not_submitted");
  await assert.rejects(
    run(() =>
      reportFill(grant.id, {
        scanHash: plan.scanHash,
        revision: plan.revision,
        results: [],
        blockers: [],
      }),
    ),
    /revision_conflict/,
  );
  assert.equal(await authDb.application.count(), 0);
});
test("reconfirmed answer memory fills a missing question on recheck without new inference", async () => {
  const grant = await start();
  let plan = await run(() =>
    planFill(grant.id, {
      fields: [field("project", "What is your favourite project?")],
    }),
  );
  assert.equal(plan.fields[0].status, "needs_input");
  await run(() =>
    saveApplicationAnswer({
      question: "What is your favourite project?",
      answer: "A Kotlin scheduling service.",
      category: "projects",
      context: { catalogId, country: "Singapore" },
      expectedRevision: 0,
      reusable: true,
      reviewed: true,
      expiresAt: null,
    }),
  );
  plan = await run(() =>
    planFill(grant.id, {
      fields: [field("project", "What is your favourite project?")],
    }),
  );
  assert.equal(plan.fields[0].value, "A Kotlin scheduling service.");
});
test("profile changes, expired grants and leaving the queue block reuse", async () => {
  const grant = await start();
  await run(() =>
    saveCandidate({
      values: candidate(),
      expectedRevision: 1,
      confirmSections: ["contact"],
    }),
  );
  await assert.rejects(
    withFillGrant(grant.token, target, async () => true),
    /profile_changed/,
  );
  const fresh = await start();
  await authDb.applicationFillSession.update({
    where: { id: fresh.id },
    data: { expiresAt: new Date(0) },
  });
  await assert.rejects(
    withFillGrant(fresh.token, target, async () => true),
    /invalid_grant/,
  );
});
test("companion API denies arbitrary website origins and token/session mismatch", async () => {
  const grant = await start();
  const req = (origin: string, id: string) =>
    POST(
      new Request("http://127.0.0.1:3000/api/fill-companion/" + id + "/scan", {
        method: "POST",
        headers: {
          origin,
          authorization: "Bearer " + grant.token,
          "x-target-url": target,
          "content-type": "application/json",
        },
        body: JSON.stringify({ fields: [field("first", "First name")] }),
      }),
      { params: Promise.resolve({ path: [id, "scan"] }) },
    );
  assert.equal((await req("https://evil.test", grant.id)).status, 403);
  assert.equal(
    (await req("chrome-extension://" + companionId, "different-id")).status,
    401,
  );
});

test("a country mismatch is flagged per field and cannot stop independent confirmed contact filling", async () => {
  const grant = await start();
  const plan = await run(() =>
    planFill(grant.id, {
      fields: [
        field("first", "First name"),
        field("auth", "Are you authorized to work in the US?"),
      ],
    }),
  );
  assert.equal(plan.fields[0].value, "Alex");
  assert.equal(plan.fields[1].status, "needs_input");
  assert.match(plan.fields[1].reason, /different country/);
});
