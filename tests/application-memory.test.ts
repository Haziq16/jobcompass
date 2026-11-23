import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { applicationReadiness } from "../src/lib/application-readiness";
import { randomUUID } from "node:crypto";
import { authDb } from "../src/lib/db";
import { inWorkspace } from "../src/lib/workspace-context";
import {
  emptyCandidate,
  classifyQuestion,
  mentionedCountry,
  candidateValuesSchema,
} from "../src/lib/application-memory-contracts";
import {
  importCandidateCv,
  getCandidate,
  saveCandidate,
  cvSuggestions,
  saveApplicationAnswer,
  lookupApplicationAnswer,
  applicationMemory,
  deleteApplicationAnswer,
  getApplicationAnswer,
  dismissApplicationQuestion,
} from "../src/lib/application-memory";
import {
  GET,
  POST,
} from "../src/app/api/application-profile/[[...path]]/route";
if (
  process.env.JOBCOMPASS_TEST !== "true" ||
  !process.env.DATABASE_URL?.includes("/jobcompass_test")
)
  throw new Error("Test database only");
const run = <T>(action: () => Promise<T>, who = "alice") =>
  inWorkspace(who, action);
const context = { country: "", company: "", catalogId: null };
test("US punctuation and current authorization stay distinct from citizenship and compound questions", () => {
  assert.equal(
    mentionedCountry("Are you currently authorized to work in the U.S.?"),
    "united states",
  );
  assert.equal(
    mentionedCountry("Are you a citizen of the U.S.A.?"),
    "united states",
  );
  assert.equal(
    classifyQuestion("Are you currently authorized to work in the U.S.?").key,
    "authorization.work",
  );
  assert.equal(
    classifyQuestion(
      "Do you now, or will you in the future, require immigration sponsorship to work at Reddit?",
    ).key,
    "sponsorship.required",
  );
  assert.equal(
    classifyQuestion(
      "Are you authorized to work and eligible for security clearance?",
    ).category,
    "custom",
  );
});
test("screening separates confirmed conflicts, unknown citizenship and supported forms", async () => {
  const profile = await run(getCandidate);
  const job = {
    title: "Engineer",
    description:
      "This role requires US citizenship and eligibility to obtain a US security clearance.",
    country: "US",
    applyUrl: "https://job-boards.greenhouse.io/example/jobs/123",
  };
  assert.equal(applicationReadiness(job, profile).status, "unknown");
  assert.equal(
    applicationReadiness(job, profile).action,
    "Check eligibility before you apply.",
  );
  assert.match(
    applicationReadiness(
      {
        ...job,
        description: "Build software.",
        applyUrl: "https://example.com/apply",
      },
      profile,
    ).action,
    /^Manual application: this form is not supported/,
  );
  const confirmed = {
    ...profile,
    sections: profile.sections.map((s) =>
      s.section === "eligibility" ? { ...s, confirmed: true } : s,
    ),
    values: {
      ...profile.values,
      eligibility: [
        {
          id: randomUUID(),
          country: "US",
          status: "work_visa" as const,
          needsSponsorship: "yes" as const,
          details: "",
          expiresOn: "",
        },
      ],
    },
  };
  assert.equal(applicationReadiness(job, confirmed).status, "incompatible");
  const authorized = {
    ...confirmed,
    values: {
      ...confirmed.values,
      eligibility: confirmed.values.eligibility.map((r) => ({
        ...r,
        status: "authorized" as const,
      })),
    },
  };
  assert.equal(applicationReadiness(job, authorized).status, "unknown");
  assert.equal(
    applicationReadiness(
      { ...job, description: "No visa sponsorship is available." },
      confirmed,
    ).status,
    "incompatible",
  );
  assert.equal(
    applicationReadiness(
      {
        ...job,
        description:
          "You do not need US citizenship. No security clearance is required.",
      },
      profile,
    ).status,
    "compatible",
  );
});
test("experience screening does not double count overlapping roles or certify an uncompleted degree", async () => {
  const base = await run(getCandidate);
  const profile = {
    ...base,
    sections: base.sections.map((s) =>
      s.section === "experience" || s.section === "education"
        ? { ...s, confirmed: true }
        : s,
    ),
    values: {
      ...base.values,
      experience: [1, 2].map((n) => ({
        id: randomUUID(),
        employer: "Fictional " + n,
        title: "Engineer",
        start: "2025-01",
        end: "2025-12",
        summary: "Confirmed work.",
      })),
      education: [
        {
          id: randomUUID(),
          institution: "Fictional University",
          qualification: "Bachelor of Engineering",
          start: "2025",
          end: "2099",
          details: "",
        },
      ],
    },
  };
  const job = {
    title: "Engineer",
    description: "Minimum 2 years of experience.",
    country: "US",
    applyUrl: "https://job-boards.greenhouse.io/example/jobs/123",
  };
  assert.equal(applicationReadiness(job, profile).status, "incompatible");
  assert.equal(
    applicationReadiness(
      { ...job, description: "Requires bachelor qualification." },
      profile,
    ).status,
    "unknown",
  );
});
const lookup = (question: string, extra = {}) =>
  run(() =>
    lookupApplicationAnswer({ question, context: { ...context, ...extra } }),
  );
const answer = (extra = {}) =>
  run(() =>
    saveApplicationAnswer({
      question: "What is your favourite project?",
      answer: "A Kotlin scheduling service I built.",
      category: "projects",
      aliases: [],
      context,
      reusable: true,
      expiresAt: null,
      expectedRevision: 0,
      reviewed: true,
      ...extra,
    }),
  );
const values = () => ({
  ...structuredClone(emptyCandidate),
  contact: {
    ...emptyCandidate.contact,
    name: "Alex Sample",
    email: "alex@example.test",
  },
});
beforeEach(async () => {
  await authDb.$executeRawUnsafe(
    'TRUNCATE "ResumeAsset","CandidateProfile","ApplicationAnswer","ApplicationQuestion","MatchDecision" CASCADE',
  );
});
after(() => authDb.$disconnect());
test("country-wide answer reuse is explicit and never crosses countries or accounts", async () => {
  const first = "a".repeat(64),
    second = "b".repeat(64);
  for (const [id, employer] of [
    [first, "First Employer"],
    [second, "Second Employer"],
  ])
    await authDb.matchDecision.create({
      data: {
        workspaceId: "alice",
        catalogId: id,
        providerId: id,
        applyUrl: "https://example.com/" + id,
        state: "queued",
        snapshot: { title: "Engineer", employer },
      },
    });
  const saved = await run(() =>
    saveApplicationAnswer({
      expectedRevision: 0,
      question: "Are you authorized to work in the US?",
      category: "authorization",
      answer: "Yes",
      context: { country: "US", company: "", catalogId: first },
      reusable: true,
      reuseScope: "country",
      expiresAt: null,
      reviewed: true,
    }),
  );
  assert.equal(saved.catalogId, null);
  assert.equal(saved.company, null);
  assert.equal(
    (
      await lookup("Are you currently authorized to work in the U.S.?", {
        country: "US",
        catalogId: second,
      })
    ).answer?.answer,
    "Yes",
  );
  assert.equal(
    (
      await lookup("Are you authorized to work?", {
        country: "UK",
        catalogId: second,
      })
    ).status,
    "missing",
  );
  assert.equal(
    (
      await run(
        () =>
          lookupApplicationAnswer({
            question: "Are you authorized to work?",
            context: { country: "US", company: "", catalogId: null },
          }),
        "bob",
      )
    ).status,
    "missing",
  );
});
test("a missing question country can be explicitly supplied and remains resolved in the inbox", async () => {
  const missing = await lookup("Are you authorized to work?");
  assert.equal(missing.status, "context_required");
  await run(() =>
    saveApplicationAnswer({
      expectedRevision: 0,
      question: "Are you authorized to work?",
      category: "authorization",
      answer: "Yes",
      context: { country: "US", company: "", catalogId: null },
      reusable: true,
      expiresAt: null,
      reviewed: true,
      questionId: missing.questionId,
    }),
  );
  const memory = await run(() => applicationMemory());
  assert.equal(memory.questions[0].resolution.status, "answered");
  assert.equal(memory.questions[0].country, "united states");
});
test("changing a different country's eligibility does not expire a separately confirmed answer", async () => {
  const v = values();
  v.eligibility = [
    {
      id: randomUUID(),
      country: "US",
      status: "citizen",
      needsSponsorship: "no",
      details: "",
      expiresOn: "",
    },
  ];
  await run(() =>
    saveCandidate({
      values: v,
      expectedRevision: 0,
      confirmSections: ["eligibility"],
    }),
  );
  await run(() =>
    saveApplicationAnswer({
      expectedRevision: 0,
      question: "Are you authorized to work in the US?",
      category: "authorization",
      answer: "Yes",
      context: { country: "US", company: "", catalogId: null },
      reusable: true,
      expiresAt: null,
      reviewed: true,
    }),
  );
  v.eligibility.push({
    id: randomUUID(),
    country: "India",
    status: "not_authorized",
    needsSponsorship: "yes",
    details: "",
    expiresOn: "",
  });
  await run(() =>
    saveCandidate({
      values: v,
      expectedRevision: 1,
      confirmSections: ["eligibility"],
    }),
  );
  assert.equal(
    (await lookup("Are you authorized to work in the US?", { country: "US" }))
      .status,
    "answered",
  );
});
test("job answer inbox filters before pagination and never substitutes another job's questions", async () => {
  const first = "a".repeat(64),
    second = "b".repeat(64);
  for (const id of [first, second])
    await authDb.matchDecision.create({
      data: {
        workspaceId: "alice",
        catalogId: id,
        providerId: id,
        applyUrl: "https://example.com/" + id,
        state: "queued",
        snapshot: { title: "Engineer", employer: id },
      },
    });
  await lookup("Describe a system you built", { catalogId: first });
  await lookup("Describe your availability", { catalogId: second });
  const memory = await run(() => applicationMemory(1, first));
  assert.equal(memory.totalQuestions, 1);
  assert.equal(memory.questions.length, 1);
  assert.equal(memory.questions[0].catalogId, first);
});
test("CV suggestions preserve source passages and never invent employment or authorization", () => {
  const result = cvSuggestions(
    "Alex Sample\nalex@example.test\nExperience\nAcme - Engineer, 2024\nBuilt Kotlin services.\nEducation\nExample University",
  );
  assert.equal(result.contact.email, "alex@example.test");
  assert.ok(result.blocks.some((b) => b.text.includes("Acme")));
  assert.ok(!("eligibility" in result));
  assert.ok(!("employer" in result));
  assert.equal(result.cvSource, null);
});
test("drafts cannot answer; confirmation enables facts and edits invalidate only changed sections", async () => {
  const v = values();
  await run(() =>
    saveCandidate({ values: v, expectedRevision: 0, confirmSections: [] }),
  );
  assert.equal((await lookup("Full name")).status, "missing");
  await run(() =>
    saveCandidate({
      values: v,
      expectedRevision: 1,
      confirmSections: ["contact"],
    }),
  );
  assert.equal(
    (await lookup("What is your full name?")).answer?.answer,
    "Alex Sample",
  );
  v.contact.name = "Alex Updated";
  await run(() =>
    saveCandidate({ values: v, expectedRevision: 2, confirmSections: [] }),
  );
  assert.equal((await lookup("Full name")).status, "missing");
  assert.equal((await run(getCandidate)).sections[0].confirmed, false);
  await assert.rejects(
    run(() =>
      saveCandidate({ values: v, expectedRevision: 2, confirmSections: [] }),
    ),
    /revision_conflict/,
  );
});
test("confirmation requires complete facts or explicit no-history declaration", async () => {
  await assert.rejects(
    run(() =>
      saveCandidate({
        values: emptyCandidate,
        expectedRevision: 0,
        confirmSections: ["contact"],
      }),
    ),
    /profile_section_incomplete/,
  );
  const v = values();
  v.nothingToDeclare = ["experience"];
  await run(() =>
    saveCandidate({
      values: v,
      expectedRevision: 0,
      confirmSections: ["experience"],
    }),
  );
  assert.equal(
    (await run(getCandidate)).sections.find((s) => s.section === "experience")
      ?.confirmed,
    true,
  );
});
test("country and question meaning are conservative, including negation and multiple countries", () => {
  assert.equal(mentionedCountry("Tell us about yourself"), null);
  assert.equal(
    mentionedCountry("Are you authorized to work in the US?"),
    "united states",
  );
  assert.equal(
    classifyQuestion("Are you authorized to work in Singapore?").category,
    "authorization",
  );
  assert.equal(
    classifyQuestion("Will you require sponsorship?").category,
    "sponsorship",
  );
  for (const q of [
    "Are you not authorized to work?",
    "What countries are you authorized to work in?",
    "Are you authorized to work in the US or UK?",
  ])
    assert.equal(classifyQuestion(q).category, "custom");
});
test("calendar dates, expiry dates and URLs reject malformed data", () => {
  const v = values();
  v.eligibility = [
    {
      id: randomUUID(),
      country: "Singapore",
      status: "work_visa",
      needsSponsorship: "no",
      details: "",
      expiresOn: "2026-02-30",
    },
  ];
  assert.equal(candidateValuesSchema.safeParse(v).success, false);
  v.eligibility[0].expiresOn = "Present";
  assert.equal(candidateValuesSchema.safeParse(v).success, false);
  v.eligibility[0].expiresOn = "2027-02-28";
  assert.equal(candidateValuesSchema.safeParse(v).success, true);
  v.contact.portfolio = "https://";
  assert.equal(candidateValuesSchema.safeParse(v).success, false);
});
test("authorization and sponsorship stay separate and country specific", async () => {
  const v = values();
  v.eligibility = [
    {
      id: randomUUID(),
      country: "US",
      status: "citizen",
      needsSponsorship: "no",
      details: "",
      expiresOn: "",
    },
  ];
  await run(() =>
    saveCandidate({
      values: v,
      expectedRevision: 0,
      confirmSections: ["eligibility"],
    }),
  );
  assert.equal(
    (await lookup("Are you authorized to work?", { country: "USA" })).answer
      ?.answer,
    "Yes",
  );
  assert.equal(
    (
      await lookup("Will you require sponsorship?", {
        country: "United States",
      })
    ).answer?.answer,
    "No",
  );
  assert.equal(
    (await lookup("Are you authorized to work?", { country: "UK" })).status,
    "missing",
  );
  assert.equal(
    (await lookup("Are you authorized to work?")).status,
    "context_required",
  );
  await assert.rejects(
    lookup("Are you authorized to work in the US?", { country: "UK" }),
    /question_country_mismatch/,
  );
});
test("equivalent answers require explicit confirmation and reject conflicting meanings", async () => {
  await answer({ aliases: ["Describe a project you built"] });
  assert.equal(
    (await lookup("Describe a project you built")).status,
    "answered",
  );
  assert.equal(
    (await lookup("Tell us about your greatest achievement")).status,
    "missing",
  );
  await assert.rejects(answer({ reviewed: false }));
  await assert.rejects(
    answer({
      question: "Are you authorized to work?",
      category: "authorization",
      context: { ...context, country: "US" },
      aliases: ["Will you require sponsorship?"],
    }),
    /answer_alias_conflict/,
  );
});
test("expiry policies cap volatility, reject past dates, and expose expired answers", async () => {
  const a = await answer({
    question: "Expected salary",
    category: "salary",
    context: { ...context, country: "SG" },
    answer: "SGD 90,000 per year",
    expiresAt: new Date(Date.now() + 100 * 86400000).toISOString(),
  });
  assert.ok(a.expiresAt!.valueOf() <= Date.now() + 30 * 86400000);
  await assert.rejects(
    answer({
      question: "Notice period",
      category: "availability",
      expiresAt: "2000-01-01T00:00:00Z",
    }),
    /answer_expiry_in_past/,
  );
  await authDb.applicationAnswer.update({
    where: { id: a.id },
    data: { expiresAt: new Date(0) },
  });
  assert.equal(
    (await lookup("Salary expectations", { country: "Singapore" })).status,
    "needs_review",
  );
});
test("profile edits require related memory to be reviewed again", async () => {
  const v = values();
  await run(() =>
    saveCandidate({
      values: v,
      expectedRevision: 0,
      confirmSections: ["contact"],
    }),
  );
  const a = await answer({
    question: "What is your preferred contact detail?",
    category: "contact",
    answer: "alex@example.test",
  });
  v.contact.email = "updated@example.test";
  await run(() =>
    saveCandidate({
      values: v,
      expectedRevision: 1,
      confirmSections: ["contact"],
    }),
  );
  assert.equal((await lookup(a.question)).status, "needs_review");
  await answer({
    id: a.id,
    expectedRevision: a.revision,
    question: a.question,
    category: "contact",
    answer: "updated@example.test",
  });
  assert.equal((await lookup(a.question)).status, "answered");
});
test("employer and country contexts cannot bleed between applications", async () => {
  await assert.rejects(
    answer({
      question: "Why do you want to work here?",
      category: "motivation",
    }),
    /answer_company_required/,
  );
  await answer({
    question: "Why do you want to work here?",
    category: "motivation",
    context: { ...context, company: "Example Labs" },
  });
  assert.equal(
    (
      await lookup("Why are you interested in this company?", {
        company: "Example Labs",
      })
    ).status,
    "answered",
  );
  assert.equal(
    (
      await lookup("Why are you interested in this company?", {
        company: "Other Labs",
      })
    ).status,
    "missing",
  );
  await assert.rejects(answer({ reusable: false }), /answer_job_required/);
});
test("missing questions deduplicate, can be answered, and reopen after deleting the answer", async () => {
  const q = await lookup("What is your favourite project?");
  assert.equal(
    (await lookup("What is your favourite project?")).questionId,
    q.questionId,
  );
  const a = await answer({ questionId: q.questionId });
  assert.equal(
    (await lookup("What is your favourite project?")).status,
    "answered",
  );
  await run(() => deleteApplicationAnswer(a.id, a.revision));
  const memory = await run(() => applicationMemory());
  assert.equal(memory.questions[0].state, "open");
  assert.equal(memory.questions[0].resolution.status, "missing");
  await run(() =>
    dismissApplicationQuestion(
      memory.questions[0].id,
      memory.questions[0].revision,
    ),
  );
  await lookup("What is your favourite project?");
  assert.equal(
    (await run(() => applicationMemory())).questions[0].state,
    "open",
  );
});
test("private profile, answer IDs and mutations are isolated by account", async () => {
  const a = await answer();
  await run(() =>
    saveCandidate({
      values: values(),
      expectedRevision: 0,
      confirmSections: ["contact"],
    }),
  );
  assert.equal((await run(getCandidate, "bob")).revision, 0);
  assert.equal((await run(() => applicationMemory(), "bob")).totalAnswers, 0);
  await assert.rejects(
    run(() => getApplicationAnswer(a.id), "bob"),
    /not_found/,
  );
  await assert.rejects(
    run(() => deleteApplicationAnswer(a.id, a.revision), "bob"),
    /revision_conflict/,
  );
  assert.equal((await run(() => getApplicationAnswer(a.id))).id, a.id);
});
test("API refuses cross-origin writes and anonymous hosted access", async () => {
  const env = {
    APP_ACCESS: process.env.APP_ACCESS,
    APP_URL: process.env.APP_URL,
    PUBLIC_SIGNUP: process.env.PUBLIC_SIGNUP,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  };
  try {
    process.env.APP_ACCESS = "local";
    assert.equal(
      (
        await POST(
          new Request("http://localhost:3000/api/application-profile/profile", {
            method: "POST",
            headers: {
              host: "localhost:3000",
              origin: "https://evil.test",
              "content-type": "application/json",
            },
            body: "{}",
          }),
          { params: Promise.resolve({ path: ["profile"] }) },
        )
      ).status,
      403,
    );
    process.env.APP_ACCESS = "hosted";
    process.env.APP_URL = "https://memory.example";
    process.env.PUBLIC_SIGNUP = "true";
    process.env.BETTER_AUTH_SECRET =
      "fixture-only-test-secret-with-32-characters";
    assert.equal(
      (
        await GET(
          new Request(
            "https://memory.example/api/application-profile/profile",
            { headers: { host: "memory.example" } },
          ),
          { params: Promise.resolve({ path: ["profile"] }) },
        )
      ).status,
      401,
    );
  } finally {
    Object.assign(process.env, env);
  }
});
import { NextRequest } from "next/server";
import {
  GET as workspaceGet,
  DELETE as workspaceDelete,
} from "../src/app/api/[...path]/route";
test("one-job answers require an owned queue item and never answer another job", async () => {
  const first = "a".repeat(64),
    second = "b".repeat(64);
  for (const catalogId of [first, second])
    await authDb.matchDecision.create({
      data: {
        workspaceId: "alice",
        catalogId,
        providerId: "fixture:" + catalogId,
        applyUrl: "https://example.test/apply",
        state: "queued",
        snapshot: { employer: "Example Labs" },
      },
    });
  await answer({
    question: "Why this role?",
    reusable: false,
    context: { ...context, catalogId: first },
  });
  assert.equal(
    (await lookup("Why this role?", { catalogId: first })).status,
    "answered",
  );
  assert.equal(
    (await lookup("Why this role?", { catalogId: second })).status,
    "missing",
  );
  await assert.rejects(
    run(
      () =>
        lookupApplicationAnswer({
          question: "Why this role?",
          context: { ...context, catalogId: first },
        }),
      "bob",
    ),
    /not_found/,
  );
  await assert.rejects(
    lookup("Why this role?", {
      catalogId: first,
      company: "Different Company",
    }),
    /question_company_mismatch/,
  );
});
test("exports and profile clearing cover new private memory without touching other accounts", async () => {
  const old = process.env.APP_ACCESS;
  process.env.APP_ACCESS = "local";
  try {
    await run(
      () =>
        saveCandidate({
          values: values(),
          expectedRevision: 0,
          confirmSections: ["contact"],
        }),
      "local",
    );
    await run(
      () =>
        saveApplicationAnswer({
          question: "Private project detail",
          answer: "Owned answer",
          category: "projects",
          context,
          reusable: true,
          expiresAt: null,
          expectedRevision: 0,
          reviewed: true,
        }),
      "local",
    );
    await answer({ answer: "Other account private fact" });
    const request = new NextRequest("http://127.0.0.1:3000/api/export", {
      headers: { host: "127.0.0.1:3000" },
    });
    const exported = await workspaceGet(request, {
      params: Promise.resolve({ path: ["export"] }),
    });
    assert.equal(exported.status, 200);
    const data = await exported.json();
    assert.equal(data.applicationProfile.length, 1);
    assert.equal(data.applicationAnswers.length, 1);
    assert.ok(
      !JSON.stringify(data.applicationAnswers).includes("Other account"),
    );
    const deleted = await workspaceDelete(
      new NextRequest("http://127.0.0.1:3000/api/profile", {
        method: "DELETE",
        headers: {
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ confirm: "DELETE PROFILE" }),
      }),
      { params: Promise.resolve({ path: ["profile"] }) },
    );
    assert.equal(deleted.status, 200);
    assert.equal((await run(getCandidate, "local")).revision, 0);
    assert.equal(
      (await run(() => applicationMemory(), "local")).totalAnswers,
      0,
    );
    assert.equal((await run(() => applicationMemory())).totalAnswers, 1);
  } finally {
    process.env.APP_ACCESS = old;
  }
});

import { cvLayoutFixture } from "../scripts/cv-layout-fixture.mjs";
test("CV upload and saved-source reuse preserve exact original bytes and do not confirm facts", async () => {
  const bytes: Buffer = await cvLayoutFixture();
  const first = await run(() =>
    importCandidateCv({ bytes, name: "fictional-cv.docx" }),
  );
  assert.ok(first.cvSource);
  assert.equal((await run(getCandidate)).revision, 0);
  const stored = await authDb.resumeAsset.findUniqueOrThrow({
    where: { id: first.cvSource!.assetId },
  });
  assert.deepEqual(Buffer.from(stored.bytes), bytes);
  assert.equal(stored.isDefault, false);
  const reused = await run(() => importCandidateCv());
  assert.equal(reused.cvSource?.assetId, stored.id);
  assert.equal(reused.extractedText, first.extractedText);
  await assert.rejects(
    run(() => importCandidateCv(undefined, stored.id), "bob"),
    /not_found/,
  );
  assert.equal(
    (await run(getCandidate)).sections.filter((s) => s.confirmed).length,
    0,
  );
});
