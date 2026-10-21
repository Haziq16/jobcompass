import { z } from "zod";
import { AppError } from "./contracts";
export const sections = [
  "contact",
  "experience",
  "projects",
  "education",
  "skills",
  "achievements",
  "authorization",
  "answers",
] as const;
export const factSchema = z
  .object({
    id: z.string().uuid(),
    section: z.enum(sections),
    label: z.string().trim().min(1).max(120),
    text: z.string().trim().min(1).max(3000),
    reviewed: z.literal(true),
  })
  .strict();
export const factsSchema = z
  .array(factSchema)
  .min(1)
  .max(100)
  .superRefine((facts, ctx) => {
    if (new Set(facts.map((f) => f.id)).size !== facts.length)
      ctx.addIssue({ code: "custom", message: "Fact IDs must be unique" });
  });
export type Fact = z.infer<typeof factSchema>;
const quote = z
  .object({ factId: z.string(), quote: z.string().min(1).max(3000) })
  .strict();
export const assistantOutput = z
  .object({
    resume: z.array(quote).min(1).max(30),
    coverLetter: z.array(quote).min(1).max(12),
    strengths: z
      .array(
        z
          .object({ requirement: z.string().min(1).max(600), evidence: quote })
          .strict(),
      )
      .max(15),
    gaps: z
      .array(
        z
          .object({
            requirement: z.string().min(1).max(600),
            question: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(15),
    answers: z
      .array(
        z
          .object({
            question: z.string().min(1).max(500),
            evidence: quote.nullable(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type AssistantOutput = z.infer<typeof assistantOutput>;
export function validateGrounding(
  output: AssistantOutput,
  facts: Fact[],
  jobText: string,
  questions: string[],
) {
  const verify = (q: { factId: string; quote: string }) => {
    const fact = facts.find((f) => f.id === q.factId && f.reviewed);
    if (!fact || !fact.text.includes(q.quote))
      throw new AppError("ungrounded_output", 422);
  };
  [
    ...output.resume,
    ...output.coverLetter,
    ...output.strengths.map((s) => s.evidence),
    ...output.answers.flatMap((a) => (a.evidence ? [a.evidence] : [])),
  ].forEach(verify);
  if (
    [...output.strengths, ...output.gaps].some(
      (s) => !jobText.includes(s.requirement),
    )
  )
    throw new AppError("ungrounded_requirement", 422);
  if (
    output.answers.some((a) => !questions.includes(a.question)) ||
    new Set(output.answers.map((a) => a.question)).size !==
      output.answers.length ||
    output.answers.length !== questions.length
  )
    throw new AppError("invalid_answers", 422);
  return output;
}
export function interview(facts: Fact[]) {
  return sections
    .filter((s) => !facts.some((f) => f.section === s))
    .map((section) => ({
      section,
      question:
        section === "authorization"
          ? "What work authorization can you confirm? Leave unanswered if unknown."
          : `What verified ${section} information should applications use? Include exact dates or metrics only if you can confirm them.`,
    }));
}
