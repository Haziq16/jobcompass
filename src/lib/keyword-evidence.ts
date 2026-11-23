import { z } from "./zod";
import { AppError } from "./contracts";
import { cvSkillSignals, resumeChecks } from "./resume-checks";
export const keywordEvidenceSchema = z
  .array(
    z
      .object({
        term: z.string().trim().min(1).max(100),
        evidence: z.string().trim().min(20).max(800),
        reviewed: z.literal(true),
      })
      .strict(),
  )
  .max(20);
export type KeywordEvidence = z.infer<typeof keywordEvidenceSchema>;
export function validateKeywordEvidence(
  raw: unknown,
  resume: string,
  job: string,
): KeywordEvidence {
  const facts = keywordEvidenceSchema.parse(raw || []);
  const missing = resumeChecks(resume, job).keywords.filter(
    (k) => !k.mentioned,
  );
  if (new Set(facts.map((f) => f.term.toLowerCase())).size !== facts.length)
    throw new AppError("duplicate_keyword_evidence", 400);
  for (const fact of facts) {
    if (
      !missing.some((k) => k.name === fact.term) ||
      !resumeChecks(fact.evidence, job).keywords.some(
        (k) => k.name === fact.term && k.mentioned,
      ) ||
      (cvSkillSignals(fact.term).includes(fact.term) &&
        !cvSkillSignals(fact.evidence).includes(fact.term))
    )
      throw new AppError("keyword_evidence_required", 422);
  }
  return facts;
}
export function keywordEvidenceText(checks: unknown) {
  const parsed = keywordEvidenceSchema.safeParse(
    (checks as { keywordEvidence?: unknown } | null)?.keywordEvidence || [],
  );
  return parsed.success
    ? parsed.data.map((f) => `Confirmed ${f.term}: ${f.evidence}`).join("\n")
    : "";
}
