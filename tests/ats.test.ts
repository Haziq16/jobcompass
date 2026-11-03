import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import JSZip from "jszip";
import { authDb } from "../src/lib/db";
import { inWorkspace } from "../src/lib/workspace-context";
import {
  ATS_VERSION,
  analyzeAts,
  jobRequirements,
  parseCvText,
} from "../src/lib/ats-analysis";
import { inspectAtsDocument } from "../src/lib/ats-document";
import {
  requireVerifiedExport,
  verifyCvExport,
} from "../src/lib/cv-export-verification";
import { cvDocumentBytes } from "../src/lib/tailored-cv-document";
import { saveCvSource } from "../src/lib/cv-source";
import { savePreparedCv } from "../src/lib/prepared-cv";
import { originalText } from "../src/lib/original-cv-contracts";
import { inspectDocx } from "../src/lib/docx-template";
import { POST as report } from "../src/app/api/ai/ats/route";
import { GET as download } from "../src/app/api/ai/cv-drafts/[id]/download/route";
import { POST as parseUpload } from "../src/app/api/ai/parse/route";
import { atsFixtures, pdfFixture, sampleText } from "../scripts/ats-fixtures";
import { runAtsBenchmark } from "../scripts/ats-benchmark";
import baseline from "../src/lib/ats-benchmark-result.json";
if (
  process.env.JOBCOMPASS_TEST !== "true" ||
  !process.env.DATABASE_URL?.includes("/jobcompass_test")
)
  throw Error("Isolated tests required");
beforeEach(async () => {
  process.env.APP_ACCESS = "local";
  process.env.AI_MODE = "byok";
  await authDb.$executeRawUnsafe('TRUNCATE "AiReview","ResumeAsset" CASCADE');
});
after(() => authDb.$disconnect());
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const request = (data: unknown, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/ai/ats", {
    method: "POST",
    headers: {
      origin,
      host: "localhost:3000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
async function fixture() {
  const source = await saveCvSource(
    await cvDocumentBytes(sampleText),
    "source.docx",
  );
  const inspection = await inspectDocx(await cvDocumentBytes(sampleText));
  const document = {
    format: "original-docx" as const,
    sourceAssetId: source.sourceDocument.id,
    sourceSha256: source.sourceDocument.sha256,
    findings: inspection.findings,
    paragraphs: inspection.paragraphs.map((p) => ({
      ...p,
      original: p.text,
      text: p.text,
    })),
  };
  const content = originalText(document);
  const review = await authDb.aiReview.create({
    data: {
      workspaceId: "local",
      requestKey: randomUUID(),
      fingerprint: randomUUID(),
      provider: "openai",
      model: "fixture",
      state: "succeeded",
      jobSnapshot: {
        source: "workspace",
        id: "fixture",
        title: "Software Engineer",
        employer: "Cedar",
        description: "TypeScript is required.",
      },
      resumeSnapshot: sampleText,
      checks: {},
    },
  });
  const draft = await authDb.aiCvDraft.create({
    data: {
      workspaceId: "local",
      reviewId: review.id,
      requestKey: randomUUID(),
      fingerprint: randomUUID(),
      provider: "openai",
      model: "fixture",
      state: "succeeded",
      content,
      approvedHash: hash(content),
      document,
    },
  });
  return { source, draft };
}
test("parser fields retain traceable locations and distinguish header/footer from body", async () => {
  for (const file of (await atsFixtures()).filter((file) =>
    [
      "word-single",
      "pdf-single",
      "word-header-contact",
      "word-unicode",
    ].includes(file.id),
  )) {
    const parser = await inspectAtsDocument(file.bytes, file.name);
    assert.ok(
      parser.fields.every((field) =>
        field.sourceIds.every((id) =>
          parser.lines.some((line) => line.id === id),
        ),
      ),
    );
    assert.ok(parser.fields.some((field) => field.kind === "name"));
    if (file.id === "word-header-contact")
      assert.ok(
        parser.lines.some(
          (line) => line.region === "header" && line.text.includes("@"),
        ),
      );
  }
});
test("PDF order, column and empty-page risks are observed without fabricating OCR text", async () => {
  for (const file of (await atsFixtures()).filter((file) =>
    file.id.startsWith("pdf-"),
  )) {
    const parser = await inspectAtsDocument(file.bytes, file.name);
    for (const flag of file.flags)
      assert.ok(
        parser.findings.some(
          (finding) => finding.id === flag && finding.status === "review",
        ),
        file.id,
      );
    for (const flag of file.forbiddenFlags || [])
      assert.ok(
        !parser.findings.some(
          (finding) => finding.id === flag && finding.status === "review",
        ),
        file.id,
      );
    if (file.id === "pdf-no-text") assert.equal(parser.text, "");
  }
});
test("required/preferred evidence, bare mentions, negation, years and eligibility stay distinct", () => {
  const parser = parseCvText(
    sampleText + "\nI am learning Kubernetes.\nNo AWS experience.",
  );
  const rows = jobRequirements(
    "Required qualifications:\nTypeScript experience required.\nAWS required.\nPreferred qualifications:\nDocker experience.\n5 years of experience.\nUS citizenship required.",
    parser,
  );
  assert.equal(rows[0].assessment, "evidence");
  assert.equal(rows[0].priority, "required");
  assert.equal(rows[1].assessment, "not_found");
  assert.equal(rows[2].priority, "preferred");
  assert.equal(rows[3].assessment, "confirm");
  assert.equal(rows[4].assessment, "confirm");
  assert.equal(
    jobRequirements("Kubernetes required.", parser)[0].assessment,
    "not_found",
  );
  assert.equal(
    jobRequirements(
      "TypeScript required.",
      parseCvText("Alex Example\nSKILLS\nTypeScript"),
    )[0].assessment,
    "mention",
  );
});
test("new unsupported skills and metrics require source confirmation and known facts do not", () => {
  const parser = parseCvText(
    sampleText +
      "\nBuilt Kubernetes services that improved performance by 99%.",
  );
  const result = analyzeAts(parser, "", undefined, sampleText);
  assert.ok(
    result.issues.some((issue) => issue.id === "claim-skill-Kubernetes"),
  );
  assert.ok(result.issues.some((issue) => issue.id === "claim-metric-99%"));
  assert.ok(
    !result.issues.some((issue) => issue.id === "claim-skill-TypeScript"),
  );
  assert.ok(
    !analyzeAts(parser, "", undefined, parser.text).issues.some((issue) =>
      issue.id.startsWith("claim-"),
    ),
  );
});
test("final-file verification detects loss, additions and reordering, not harmless whitespace", async () => {
  for (const [actual, expected, valid] of [
    [sampleText, sampleText.replaceAll("\n", "  \n"), true],
    [sampleText.replace("Cedar Systems", ""), sampleText, false],
    ["A B", "B A", false],
    [sampleText + "\nExtra claim", sampleText, false],
  ] as const) {
    const { verification } = await verifyCvExport(
      await cvDocumentBytes(actual),
      "cv.docx",
      expected,
    );
    assert.equal(verification.state === "verified", valid);
    if (!valid)
      assert.throws(
        () => requireVerifiedExport(verification),
        /cv_export_mismatch/,
      );
  }
});
test("saved-file report is private, revision-bound, model-free and does not mutate originals", async () => {
  const { source, draft } = await fixture();
  const before = await authDb.resumeAsset.findUniqueOrThrow({
    where: { id: source.sourceDocument.id },
  });
  const response = await report(
    request({
      source: "draft",
      id: draft.id,
      revision: draft.revision,
      jobText: "TypeScript is required.",
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await response.json()).verification.state, "verified");
  assert.equal(
    (await report(request({ source: "draft", id: draft.id, revision: 999 })))
      .status,
    409,
  );
  await inWorkspace("other", async () =>
    assert.rejects(savePreparedCv(draft.id, draft.revision), /draft_not_found/),
  );
  await authDb.resumeAsset.update({
    where: { id: source.sourceDocument.id },
    data: { workspaceId: "other" },
  });
  assert.equal(
    (await report(request({ source: "asset", id: source.sourceDocument.id })))
      .status,
    404,
  );
  assert.equal(
    (
      await report(
        request({ source: "asset", id: "unknown" }, "https://hostile.example"),
      )
    ).status,
    403,
  );
  assert.equal(
    (await authDb.resumeAsset.findUniqueOrThrow({ where: { id: before.id } }))
      .sha256,
    before.sha256,
  );
});
test("corrupt rendered draft blocks both download and prepared-CV use before a library write", async () => {
  const { draft } = await fixture();
  const content = draft.content! + "\nA claim absent from the actual file.";
  const changed = await authDb.aiCvDraft.update({
    where: { id: draft.id },
    data: { content, approvedHash: hash(content) },
  });
  const count = await authDb.resumeAsset.count();
  const response = await download(
    new Request(
      "http://localhost:3000/api/ai/cv-drafts/" +
        draft.id +
        "/download?format=docx&revision=" +
        changed.revision,
      { headers: { host: "localhost:3000" } },
    ),
    { params: Promise.resolve({ id: draft.id }) },
  );
  assert.equal(response.status, 422);
  await assert.rejects(
    savePreparedCv(draft.id, changed.revision),
    /cv_export_mismatch/,
  );
  assert.equal(await authDb.resumeAsset.count(), count);
});
test("ATS endpoints reject anonymous/disabled requests and reject unsafe or oversized documents", async () => {
  process.env.APP_ACCESS = "hosted";
  assert.equal(
    (await report(request({ source: "asset", id: "unknown" }))).status,
    403, // Hosted mode rejects the local origin before session lookup.
  );
  process.env.APP_ACCESS = "local";
  process.env.AI_MODE = "off";
  assert.equal(
    (await report(request({ source: "asset", id: "unknown" }))).status,
    410,
  );
  await assert.rejects(
    inspectAtsDocument(Buffer.alloc(3 * 1024 * 1024 + 1), "cv.pdf"),
    /cv_too_large/,
  );
  await assert.rejects(
    inspectAtsDocument(Buffer.from("%PDF-broken"), "cv.pdf"),
    /cv_unreadable/,
  );
  const zip = await JSZip.loadAsync(await cvDocumentBytes(sampleText));
  zip.file("word/activeX/control.xml", "<control/>");
  await assert.rejects(
    inspectAtsDocument(
      await zip.generateAsync({ type: "nodebuffer" }),
      "cv.docx",
    ),
    /unsupported_cv/,
  );
});
test("empty PDF uploads report their text-layer limitation instead of pretending OCR succeeded", async () => {
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array(pdfFixture([[]]))], "scan.pdf", {
      type: "application/pdf",
    }),
  );
  const result = await parseUpload(
    new Request("http://localhost:3000/api/ai/parse", {
      method: "POST",
      headers: { origin: "http://localhost:3000", host: "localhost:3000" },
      body: form,
    }),
  );
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.text, "");
  assert.ok(
    data.parser.findings.some(
      (item: { id: string }) => item.id === "image-only",
    ),
  );
});
test("development benchmark records real misses and protects risk/retention regressions", async () => {
  const result = await runAtsBenchmark();
  assert.equal(result.version, ATS_VERSION);
  assert.equal(baseline.version, ATS_VERSION);
  assert.equal(result.passed, result.scenarios);
  assert.equal(result.diagnostics.passed, result.diagnostics.total);
  assert.ok(result.fields.precision >= 0.95);
  assert.ok(result.fields.recall >= 0.85);
  assert.ok(
    result.fields.falseNegative > 0,
    "Known unsupported layouts must remain visible in the published corpus",
  );
  assert.deepEqual(result, baseline);
});
