import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { authDb } from "../src/lib/db";
import { inWorkspace } from "../src/lib/workspace-context";
import { evidenceBlocks } from "../src/lib/resume-review-contracts";
import { validateKeywordEvidence } from "../src/lib/keyword-evidence";
import {
  createApplicationMaterials,
  validateMaterials,
  applicationMaterials,
  type MaterialsOutput,
} from "../src/lib/application-materials";
import { savePreparedCv } from "../src/lib/prepared-cv";
import { cvHash } from "../src/lib/tailored-cv";
import { jobWorkspace } from "../src/lib/job-workspace";
import { applicationHiringCountry } from "../src/lib/application-country";
import { saveApplicationAnswer } from "../src/lib/application-memory";
if (
  process.env.JOBCOMPASS_TEST !== "true" ||
  !process.env.DATABASE_URL?.includes("/jobcompass_test")
)
  throw Error("Isolated test database required");
const resume =
  "Alex Example\nalex@example.test\nEXPERIENCE\nBuilt TypeScript services using PostgreSQL and Docker at Example Studio.\nPROJECTS\nDeveloped JavaScript applications for an online shop.\nEDUCATION\nComputer Science at Example University.\nSKILLS\nTypeScript, PostgreSQL, Docker, JavaScript.";
const description =
  "Build TypeScript services using PostgreSQL and Docker. Kubernetes experience is preferred for this software engineering role. Work with a product team to deliver reliable web services.";
const config = {
  provider: "openai" as const,
  model: "fixture-model",
  apiKey: "fictional-provider-key-for-tests",
};
const scope = <T>(action: () => Promise<T>, who = "alice") =>
  inWorkspace(who, action);
const originalLimit = process.env.BYOK_DAILY_LIMIT;
beforeEach(async () => {
  process.env.BYOK_DAILY_LIMIT = "20";
  await authDb.$executeRawUnsafe(
    'TRUNCATE "AiReview","Job","ProfileVersion","ResumeAsset","MatchDecision","CandidateProfile","ApplicationAnswer","ApplicationQuestion" CASCADE',
  );
});
after(async () => {
  if (originalLimit === undefined) delete process.env.BYOK_DAILY_LIMIT;
  else process.env.BYOK_DAILY_LIMIT = originalLimit;
  await authDb.$disconnect();
});
async function fixture() {
  const job = await authDb.job.create({
    data: {
      workspaceId: "alice",
      title: "Software Engineer",
      employer: "Example",
      description,
      relatedFingerprint: randomUUID(),
    },
  });
  const review = await authDb.aiReview.create({
    data: {
      workspaceId: "alice",
      requestKey: randomUUID(),
      fingerprint: randomUUID(),
      provider: config.provider,
      model: config.model,
      jobSnapshot: {
        id: job.id,
        source: "workspace",
        title: job.title,
        employer: job.employer,
        description,
      },
      resumeSnapshot: resume,
      state: "succeeded",
      checks: {},
    },
  });
  return {
    job,
    review,
    input: {
      reviewId: review.id,
      requestKey: randomUUID(),
      questions: ["Describe a relevant project."],
      consent: true as const,
    },
  };
}
function output(): MaterialsOutput {
  const block = evidenceBlocks(resume).find((block) =>
    block.text.startsWith("Built TypeScript"),
  )!;
  const evidence = [{ blockId: block.id, quote: block.text }];
  return {
    coverLetter: [
      {
        text: "I build TypeScript services using PostgreSQL and Docker.",
        evidence,
      },
      {
        text: "My experience building services would support this engineering role.",
        evidence,
      },
    ],
    answers: [
      {
        question: "Describe a relevant project.",
        text: "I built TypeScript services using PostgreSQL and Docker at Example Studio.",
        evidence,
      },
    ],
  };
}
test("selected keywords require explicit supported experience and cannot import unrelated job terms", () => {
  const fact = {
    term: "Kubernetes",
    evidence: "I used Kubernetes in a personal deployment project.",
    reviewed: true,
  };
  assert.equal(validateKeywordEvidence([fact], resume, description).length, 1);
  for (const evidence of [
    "I have no Kubernetes experience at present.",
    "I am learning Kubernetes and want to use it later.",
  ])
    assert.throws(
      () =>
        validateKeywordEvidence([{ ...fact, evidence }], resume, description),
      /keyword_evidence_required/,
    );
  assert.throws(() =>
    validateKeywordEvidence(
      [{ ...fact, reviewed: false }],
      resume,
      description,
    ),
  );
  assert.throws(() =>
    validateKeywordEvidence(
      [{ ...fact, evidence: "I have worked on a deployment project." }],
      resume,
      description,
    ),
  );
  assert.throws(() =>
    validateKeywordEvidence(
      [
        {
          ...fact,
          term: "AWS",
          evidence: "I used AWS in a personal deployment project.",
        },
      ],
      resume,
      description,
    ),
  );
  assert.throws(() =>
    validateKeywordEvidence([fact, fact], resume, description),
  );
});
test("application material claims need real citations; metrics and protected facts cannot be invented", () => {
  assert.equal(
    validateMaterials(output(), resume, ["Describe a relevant project."])
      .answers.length,
    1,
  );
  const bad = output();
  bad.coverLetter[0].text += " Improved revenue by 99%.";
  assert.throws(() =>
    validateMaterials(bad, resume, ["Describe a relevant project."]),
  );
  const forged = output();
  forged.answers[0].evidence[0].quote = "Invented professional experience.";
  assert.throws(() =>
    validateMaterials(forged, resume, ["Describe a relevant project."]),
  );
  const personal = output();
  personal.answers[0].question = "Do you require visa sponsorship?";
  assert.throws(() =>
    validateMaterials(personal, resume, [personal.answers[0].question]),
  );
  personal.answers[0].text = null;
  personal.answers[0].evidence = [];
  assert.equal(
    validateMaterials(personal, resume, [personal.answers[0].question])
      .answers[0].text,
    null,
  );
});
test("application materials persist private editable documents and replay without another provider call", async () => {
  const { input, job } = await fixture();
  let calls = 0;
  const provider = async () => {
    calls++;
    return { output: output(), inputTokens: 100, outputTokens: 60 };
  };
  const first = await scope(() =>
    createApplicationMaterials(input, config, provider),
  );
  assert.equal(first.state, "succeeded");
  const again = await scope(() =>
    createApplicationMaterials(
      { ...input, requestKey: randomUUID() },
      config,
      provider,
    ),
  );
  assert.equal(again.id, first.id);
  assert.equal(calls, 1);
  const own = await scope(() => applicationMaterials(input.reviewId));
  assert.equal(own[0].drafts.length, 2);
  assert.equal(
    (await scope(() => applicationMaterials(input.reviewId), "bob")).length,
    0,
  );
  await assert.rejects(
    scope(() => createApplicationMaterials(input, config, provider), "bob"),
  );
  assert.equal(
    (await authDb.application.findUniqueOrThrow({ where: { jobId: job.id } }))
      .status,
    "Preparing",
  );
});
test("uncertain material generation is not retried and still counts against the shared allowance", async () => {
  const { input } = await fixture();
  let calls = 0;
  const provider = async () => {
    calls++;
    throw Error("Simulated provider timeout");
  };
  const first = await scope(() =>
    createApplicationMaterials(input, config, provider),
  );
  assert.equal(first.state, "uncertain");
  const replay = await scope(() =>
    createApplicationMaterials(input, config, provider),
  );
  assert.equal(replay.id, first.id);
  assert.equal(calls, 1);
  process.env.BYOK_DAILY_LIMIT = "1";
  await assert.rejects(
    scope(() =>
      createApplicationMaterials(
        { ...input, requestKey: randomUUID(), questions: [] },
        config,
        provider,
      ),
    ),
    /limit/i,
  );
});
test("material request keys cannot be reused for a changed question list", async () => {
  const { input } = await fixture();
  await scope(() =>
    createApplicationMaterials(input, config, async () => ({
      output: output(),
    })),
  );
  await assert.rejects(
    scope(() =>
      createApplicationMaterials(
        { ...input, questions: [] },
        config,
        async () => ({ output: output() }),
      ),
    ),
    /idempotency/i,
  );
});
test("a tailored CV enters the library only after exact-revision review; the original stays separate", async () => {
  const { review } = await fixture();
  const draft = await authDb.aiCvDraft.create({
    data: {
      workspaceId: "alice",
      reviewId: review.id,
      requestKey: randomUUID(),
      fingerprint: randomUUID(),
      provider: config.provider,
      model: config.model,
      state: "succeeded",
      content: resume,
    },
  });
  await assert.rejects(
    scope(() => savePreparedCv(draft.id, draft.revision)),
    /review/i,
  );
  await authDb.aiCvDraft.update({
    where: { id: draft.id },
    data: { approvedHash: cvHash(resume) },
  });
  await assert.rejects(
    scope(() => savePreparedCv(draft.id, draft.revision + 1)),
    /revision/i,
  );
  await assert.rejects(
    scope(() => savePreparedCv(draft.id, draft.revision), "bob"),
  );
  const asset = await scope(() => savePreparedCv(draft.id, draft.revision));
  assert.equal(
    (await authDb.resumeAsset.findUniqueOrThrow({ where: { id: asset.id } }))
      .isDefault,
    false,
  );
  assert.equal(
    (await scope(() => savePreparedCv(draft.id, draft.revision))).id,
    asset.id,
  );
});
test("pipeline counts and attention lists are workspace-private and never claim uncertain applications applied", async () => {
  const { job } = await fixture();
  await authDb.application.create({
    data: { workspaceId: "alice", jobId: job.id, status: "Applied" },
  });
  const mine = await scope(() =>
    jobWorkspace(new URLSearchParams("tab=applied"), false),
  );
  assert.equal(mine.total, 1);
  assert.equal(mine.rows[0].title, job.title);
  const other = await scope(
    () => jobWorkspace(new URLSearchParams("tab=applied"), false),
    "bob",
  );
  assert.equal(other.total, 0);
  assert.equal(other.counts.applied, 0);
});
test("preparation answers can precede queuing only with the account's completed job review", async () => {
  const { review } = await fixture();
  const catalogId = "a".repeat(64);
  await authDb.aiReview.update({
    where: { id: review.id },
    data: {
      jobSnapshot: {
        id: catalogId,
        source: "catalog",
        title: "Software Engineer",
        employer: "Example",
        description,
      },
    },
  });
  const input = {
    question: "Why are you interested in this role?",
    answer: "My TypeScript service experience fits this engineering role.",
    category: "motivation",
    context: { catalogId, company: "Example", country: "" },
    reviewed: true,
    reusable: false,
    reuseScope: "context",
    expectedRevision: 0,
    expiresAt: null,
  };
  await assert.rejects(
    scope(() => saveApplicationAnswer(input), "bob"),
    /not_found/,
  );
  await assert.rejects(
    scope(() =>
      saveApplicationAnswer({
        ...input,
        context: { ...input.context, company: "Other employer" },
      }),
    ),
    /question_company_mismatch/,
  );
  const saved = await scope(() => saveApplicationAnswer(input));
  assert.equal(saved.catalogId, catalogId);
  assert.equal(await authDb.matchDecision.count(), 0);
});

test("country comes from explicit listing evidence; ambiguous worldwide locations do not become citizenship facts", () => {
  assert.equal(
    applicationHiringCountry(
      { country: "Unspecified", location: "Remote - United States" },
      "India",
    ),
    "United States",
  );
  assert.equal(
    applicationHiringCountry({ location: "Canada or United States" }, "India"),
    "",
  );
  assert.equal(
    applicationHiringCountry({ location: "Canada or US" }, "India"),
    "",
  );
  assert.equal(
    applicationHiringCountry({ location: "Worldwide" }, "Unspecified"),
    "",
  );
  assert.equal(
    applicationHiringCountry({ country: "Singapore", location: "Remote" }),
    "Singapore",
  );
});
