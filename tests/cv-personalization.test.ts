import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { authDb, db } from "../src/lib/db";
import { inWorkspace } from "../src/lib/workspace-context";
import { inspectDocx, editDocx } from "../src/lib/docx-template";
import { saveCvSource, ownedCvSource } from "../src/lib/cv-source";
import { createPersonalReview } from "../src/lib/personal-ai";
import { createCvDraft, saveCvDraft } from "../src/lib/tailored-cv";
import { evidenceBlocks } from "../src/lib/resume-review-contracts";
import { isOriginalCv, originalText } from "../src/lib/original-cv-contracts";
import { GET as download } from "../src/app/api/ai/cv-drafts/[id]/download/route";
import { listCatalog } from "../src/lib/catalog";
import {
  recommendationProfile,
  smartQuery,
} from "../src/lib/job-recommendations";
import { cvLayoutFixture } from "../scripts/cv-layout-fixture.mjs";
import { validateOriginalCv } from "../src/lib/original-cv-generation";
if (
  process.env.JOBCOMPASS_TEST !== "true" ||
  !process.env.DATABASE_URL?.includes("/jobcompass_test")
)
  throw new Error("Isolated test DB required");
beforeEach(async () => {
  process.env.APP_ACCESS = "local";
  process.env.AI_MODE = "byok";
  process.env.BYOK_DAILY_LIMIT = "20";
  await authDb.$executeRawUnsafe(
    'TRUNCATE TABLE "AiReview","ResumeAsset","User","Job","Profile","Settings","CatalogBoard","CatalogSync" CASCADE',
  );
});
after(async () => {
  await db.$disconnect();
});
test("Word edits keep all non-body parts, fonts, margins, headers and unchanged bold words", async () => {
  const source: Buffer = await cvLayoutFixture();
  const inspection = await inspectDocx(source);
  const para = inspection.paragraphs.find((p) =>
    p.text.startsWith("Built Kotlin"),
  )!;
  const output = await editDocx(source, [
    { id: para.id, text: para.text.replace("Built", "Developed") },
  ]);
  const a = await JSZip.loadAsync(source),
    b = await JSZip.loadAsync(output);
  for (const name of Object.keys(a.files).filter(
    (n) => !a.files[n].dir && n !== "word/document.xml",
  ))
    assert.deepEqual(
      await b.file(name)!.async("uint8array"),
      await a.file(name)!.async("uint8array"),
      name,
    );
  const xml = await b.file("word/document.xml")!.async("string");
  assert.ok(xml.includes('w:left="900"'));
  assert.ok(xml.includes("<w:b/>"));
  assert.ok(xml.includes("Kotlin "));
  assert.ok((await inspectDocx(output)).text.includes("Developed Kotlin"));
  assert.equal((await inspectDocx(source)).text, inspection.text);
});
test("ATS inspection detects columns, tables and header contacts and refuses active content", async () => {
  const source: Buffer = await cvLayoutFixture({
    columns: true,
    tables: true,
    headerContact: true,
  });
  const report = await inspectDocx(source);
  for (const id of ["columns", "tables", "contact-region"])
    assert.equal(report.findings.find((f) => f.id === id)?.status, "review");
  const zip = await JSZip.loadAsync(source);
  zip.file("word/activeX/control.xml", "<control/>");
  await assert.rejects(
    inspectDocx(await zip.generateAsync({ type: "nodebuffer" })),
    /unsupported_cv/,
  );
});
test("original templates stay private, require matching sources, and export exact approved paragraph edits", async () => {
  const bytes: Buffer = await cvLayoutFixture();
  const source = await saveCvSource(bytes, "source.docx", true);
  assert.equal(
    (await db.profile.findUniqueOrThrow({ where: { id: "owner" } })).cvText,
    source.text,
  );
  await assert.rejects(
    inWorkspace("other", () => ownedCvSource(source.sourceDocument.id)),
    /cv_source_missing/,
  );
  const job = await db.job.create({
    data: {
      title: "Android Engineer",
      employer: "Example",
      description:
        "Kotlin experience is required. Build Android services with PostgreSQL and Docker. Collaborate with product teams on reliable application features and support ongoing product development.",
      relatedFingerprint: randomUUID(),
    },
  });
  const input = {
    source: "workspace" as const,
    jobId: job.id,
    resumeText: source.text,
    sourceAssetId: source.sourceDocument.id,
    provider: "openai" as const,
    model: "fixture-model",
    apiKey: "fixture-model-key-not-real-123",
    consent: true as const,
    reviewed: true as const,
    requestKey: randomUUID(),
  };
  let reviewCalls = 0;
  const block = evidenceBlocks(source.text).find((p) =>
    p.text.startsWith("Built Kotlin"),
  )!;
  const review = await createPersonalReview(input, async () => {
    reviewCalls++;
    return {
      output: {
        requirements: [
          {
            jobQuote: "Kotlin experience is required.",
            priority: "required",
            assessment: "supported",
            evidence: [{ blockId: block.id, quote: block.text }],
            question: "",
          },
        ],
        outline: [
          {
            heading: "Experience",
            excerpts: [{ blockId: block.id, quote: block.text }],
          },
        ],
      },
    };
  });
  await assert.rejects(
    createPersonalReview(
      {
        ...input,
        resumeText: source.text + " Different content",
        requestKey: randomUUID(),
      },
      async () => {
        throw new Error("must not call");
      },
    ),
    /cv_source_mismatch/,
  );
  const para = (await inspectDocx(bytes)).paragraphs.find((p) =>
    p.text.startsWith("Built Kotlin"),
  )!;
  let calls = 0;
  const raw = {
    provider: input.provider,
    model: input.model,
    apiKey: input.apiKey,
    requestKey: randomUUID(),
    consent: true as const,
    layout: "original" as const,
  };
  const provider = async () => {
    calls++;
    return {
      output: {
        replacements: [
          { id: para.id, text: para.text.replace("Built", "Developed") },
        ],
      },
      inputTokens: 90,
      outputTokens: 80,
    };
  };
  const draft = await createCvDraft(review.id, raw, provider);
  assert.equal(draft.state, "succeeded");
  assert.ok(isOriginalCv(draft.document));
  await createCvDraft(review.id, raw, provider);
  assert.equal(calls, 1);
  assert.equal(reviewCalls, 1);
  const doc = draft.document;
  if (!isOriginalCv(doc)) throw new Error("missing original document");
  const revised = {
    ...doc,
    paragraphs: doc.paragraphs.map((p) =>
      p.id === para.id
        ? { ...p, text: p.text.replace("Developed", "Implemented") }
        : p,
    ),
  };
  const saved = await saveCvDraft(draft.id, {
    content: originalText(revised),
    revision: 1,
    approved: true,
    paragraphEdits: [
      {
        id: para.id,
        text: revised.paragraphs.find((p) => p.id === para.id)!.text,
      },
    ],
  });
  const request = new Request(
    `http://localhost:3000/api/ai/cv-drafts/${saved.id}/download?format=docx&revision=${saved.revision}`,
    { headers: { host: "localhost:3000" } },
  );
  const response = await download(request, {
    params: Promise.resolve({ id: saved.id }),
  });
  assert.equal(response.status, 200);
  const result = await inspectDocx(Buffer.from(await response.arrayBuffer()));
  assert.ok(result.text.includes("Implemented Kotlin"));
  assert.equal(
    (await ownedCvSource(source.sourceDocument.id)).text,
    source.text,
  );
  const bad = await createCvDraft(
    review.id,
    { ...raw, requestKey: randomUUID() },
    async () => ({
      output: {
        replacements: [{ id: para.id, text: para.text + " Improved by 99%." }],
      },
    }),
  );
  assert.equal(bad.error, "cv_unsupported_number");
});
test("confirmed additional skills enter the original Word layout without changing its source or allowing unsupported metrics", async () => {
  const bytes: Buffer = await cvLayoutFixture();
  const source = await saveCvSource(bytes, "confirmed-skills.docx", true);
  const inspection = await inspectDocx(bytes);
  const paragraph = inspection.paragraphs.find(
    (p) => p.text === "Kotlin, PostgreSQL, Docker, Android",
  )!;
  const template = {
    sourceAssetId: source.sourceDocument.id,
    sourceSha256: source.sourceDocument.sha256,
    inspection,
    confirmedKeywords:
      "Confirmed Kubernetes: I used Kubernetes for a personal deployment project.",
  };
  const replacement = {
    replacements: [{ id: paragraph.id, text: paragraph.text + ", Kubernetes" }],
  };
  const document = await validateOriginalCv(replacement, template);
  assert.ok(originalText(document).includes("Android, Kubernetes"));
  await assert.rejects(
    validateOriginalCv(replacement, { ...template, confirmedKeywords: "" }),
    /cv_unsupported_skill/,
  );
  await assert.rejects(
    validateOriginalCv(
      {
        replacements: [
          {
            id: paragraph.id,
            text: paragraph.text + ", Kubernetes, 99% improvement",
          },
        ],
      },
      template,
    ),
    /cv_unsupported_number/,
  );
  assert.equal(
    (await ownedCvSource(source.sourceDocument.id)).text,
    source.text,
  );
  const exported = await inspectDocx(
    await editDocx(bytes, replacement.replacements),
  );
  assert.ok(exported.text.includes("Android, Kubernetes"));
  assert.equal(exported.paragraphs.length, inspection.paragraphs.length);
});

test("personalized discovery ranks the entire catalogue before pagination and keeps CV signals account scoped", async () => {
  const now = new Date();
  await authDb.catalogBoard.create({
    data: {
      id: "rank-board",
      name: "Example",
      platform: "ashby",
      token: "example",
      lastSuccessAt: now,
    },
  });
  await authDb.catalogJob.createMany({
    data: Array.from({ length: 85 }, (_, i) => ({
      id: `rank-${i}`,
      providerId: `rank-${i}`,
      boardId: "rank-board",
      title: i === 84 ? "Android Engineer" : "Sales Manager",
      employer: "Example",
      description:
        i === 84
          ? "Build Android applications using Kotlin and PostgreSQL"
          : "Grow business accounts",
      searchText:
        i === 84
          ? "Android Engineer Kotlin PostgreSQL"
          : "Sales Manager business accounts",
      sourceUrl: "https://example.test/job",
      applyUrl: "https://example.test/apply",
      hash: `${i}`,
      publishedAt: new Date(now.valueOf() - i * 3600000),
    })),
  });
  await db.profile.create({
    data: {
      titles: ["Android Developer"],
      cvText: "Android Developer\nKotlin and PostgreSQL\nNo Java experience.",
      skills: [],
      years: 1,
    },
  });
  const profile = await recommendationProfile();
  assert.ok(profile.skills.some((s) => s.term === "Kotlin"));
  assert.ok(!profile.skills.some((s) => s.term === "Java"));
  const matches = await listCatalog(new URLSearchParams({ forYou: "true" }));
  assert.equal(matches.jobs[0].id, "rank-84");
  assert.ok(
    matches.jobs[0].recommendation.reasons.some((r) => r.includes("Kotlin")),
  );
  const other = await inWorkspace("other", () =>
    listCatalog(new URLSearchParams({ forYou: "true" })),
  );
  assert.equal(other.personalization.hasSignals, false);
  assert.notEqual(other.jobs[0].id, "rank-84");
  const search = await listCatalog(
    new URLSearchParams({ q: "Android Developer" }),
  );
  assert.equal(search.total, 1);
  assert.equal(search.jobs[0].id, "rank-84");
  assert.ok(smartQuery('"Java developer"').includes('"Java developer"'));
});
