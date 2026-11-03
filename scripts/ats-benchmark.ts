import { mkdir, writeFile } from "node:fs/promises";
import { atsFixtures, sampleText } from "./ats-fixtures";
import { inspectAtsDocument } from "../src/lib/ats-document";
import {
  ATS_VERSION,
  jobRequirements,
  parseCvText,
} from "../src/lib/ats-analysis";
import { verifyCvExport } from "../src/lib/cv-export-verification";
import { cvDocumentBytes } from "../src/lib/tailored-cv-document";
export async function runAtsBenchmark() {
  let truePositive = 0,
    falsePositive = 0,
    falseNegative = 0,
    diagnosticPassed = 0,
    diagnosticTotal = 0;
  const cases: { id: string; passed: boolean; exactFields?: boolean }[] = [];
  const kinds = new Set(["name", "email", "jobTitle", "employer", "degree"]);
  const fixtures = await atsFixtures();
  for (const fixture of fixtures) {
    const parser = await inspectAtsDocument(fixture.bytes, fixture.name);
    const expected = new Set(
      fixture.expected.map((field) => field.kind + ":" + field.value),
    );
    const actual = new Set(
      parser.fields
        .filter((field) => kinds.has(field.kind))
        .map((field) => field.kind + ":" + field.value),
    );
    for (const value of expected) {
      if (actual.has(value)) truePositive++;
      else falseNegative++;
    }
    for (const value of actual) if (!expected.has(value)) falsePositive++;
    const flags = new Set(
      parser.findings
        .filter((finding) => finding.status === "review")
        .map((finding) => finding.id),
    );
    const decisions = [
      ...fixture.flags.map((flag) => flags.has(flag)),
      ...(fixture.forbiddenFlags || []).map((flag) => !flags.has(flag)),
    ];
    diagnosticTotal += decisions.length;
    diagnosticPassed += decisions.filter(Boolean).length;
    cases.push({
      id: fixture.id,
      passed: decisions.every(Boolean),
      exactFields:
        [...expected].every((field) => actual.has(field)) &&
        [...actual].every((field) => expected.has(field)),
    });
  }
  for (const [id, exported, expected, valid] of [
    ["export-clean", sampleText, sampleText, true],
    ["export-loss", sampleText.replace("Cedar Systems", ""), sampleText, false],
    ["export-order", "B\nA", "A\nB", false],
    [
      "export-addition",
      sampleText + "\nInvented qualification",
      sampleText,
      false,
    ],
  ] as const) {
    const { verification } = await verifyCvExport(
      await cvDocumentBytes(exported),
      "export.docx",
      expected,
    );
    cases.push({ id, passed: (verification.state === "verified") === valid });
  }
  for (const [id, resume, job, assessment] of [
    [
      "requirement-experience",
      sampleText,
      "TypeScript is required.",
      "evidence",
    ],
    [
      "requirement-negation",
      "Jordan Ellis\nSKILLS\nNo Kubernetes experience.",
      "Kubernetes is required.",
      "not_found",
    ],
    [
      "requirement-learning",
      "Jordan Ellis\nPROJECTS\nI am learning Kubernetes.",
      "Kubernetes is required.",
      "not_found",
    ],
    [
      "requirement-eligibility",
      sampleText,
      "US citizenship is required.",
      "confirm",
    ],
    [
      "requirement-years",
      sampleText,
      "5 years of TypeScript experience required.",
      "confirm",
    ],
  ] as const)
    cases.push({
      id,
      passed:
        jobRequirements(job, parseCvText(resume))[0]?.assessment === assessment,
    });
  return {
    version: ATS_VERSION,
    fixtures: fixtures.length,
    scenarios: cases.length,
    passed: cases.filter((item) => item.passed).length,
    fields: {
      truePositive,
      falsePositive,
      falseNegative,
      precision: truePositive / (truePositive + falsePositive || 1),
      recall: truePositive / (truePositive + falseNegative || 1),
    },
    diagnostics: { passed: diagnosticPassed, total: diagnosticTotal },
    cases,
    limitations:
      "Small, synthetic English-focused development corpus. Not employer ATS accuracy, population accuracy, interview prediction or multilingual certification. PDF fixtures use a simple text layer; complex fonts and OCR are not benchmarked.",
  };
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/ats-benchmark.ts")) {
  void (async () => {
    const result = await runAtsBenchmark();
    await mkdir("test-results", { recursive: true });
    await writeFile(
      "test-results/ats-benchmark.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    if (process.argv.includes("--publish")) {
      await writeFile(
        "src/lib/ats-benchmark-result.json",
        JSON.stringify(result, null, 2) + "\n",
      );
      await writeFile(
        "docs/ats-benchmark.md",
        "# ATS development benchmark\n\nEngine " +
          result.version +
          ". " +
          result.scenarios +
          " scenarios, " +
          result.passed +
          " passed.\n\nStructured candidate fields: " +
          result.fields.truePositive +
          " exact matches, " +
          result.fields.falsePositive +
          " extra predictions, " +
          result.fields.falseNegative +
          " missed expected fields. Precision " +
          (result.fields.precision * 100).toFixed(1) +
          "%; recall " +
          (result.fields.recall * 100).toFixed(1) +
          "%.\n\nLayout/text-risk checks: " +
          result.diagnostics.passed +
          "/" +
          result.diagnostics.total +
          ". Export tests cover intact text, loss, reordering and additions. Requirement tests cover demonstrated wording, negation, learning, citizenship and years.\n\n" +
          result.limitations +
          "\n\nRerun: node --import=tsx scripts/ats-benchmark.ts --publish. Independent expected fields live in scripts/ats-fixtures.ts. Exact kind/value matching is used; confidence labels do not prove correctness. No real CVs, model calls or external uploads are used.\n",
      );
    }
    console.log(JSON.stringify(result));
    if (result.passed !== result.scenarios) process.exitCode = 1;
  })();
}
