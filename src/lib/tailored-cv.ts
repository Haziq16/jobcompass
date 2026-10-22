import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { generateText, Output } from "ai";
import { z } from "zod";
import { db } from "./db";
import { AppError } from "./contracts";
import { workspaceId } from "./workspace-context";
import { credentials, evidenceBlocks } from "./resume-review-contracts";
import {
  personalModel,
  personalProviderError,
  type PersonalCredentials,
} from "./personal-ai-provider";
import {
  cvModelDocument,
  cvSystem,
  cvText,
  validateCv,
} from "./tailored-cv-contracts";
import { expireReviews } from "./personal-ai";
import { REVIEW_PROVIDER_TIMEOUT_MS } from "./personal-ai-timing";
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const cvHash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export type CvProvider = (
  config: PersonalCredentials,
  resume: string,
  jobText: string,
) => Promise<{ output: unknown; inputTokens?: number; outputTokens?: number }>;
const generateCv: CvProvider = async (config, resume, jobText) => {
  const result = await generateText({
    model: personalModel(config),
    system: cvSystem,
    prompt: JSON.stringify({
      task: "tailored_cv",
      resumeBlocks: evidenceBlocks(resume),
      jobText,
    }),
    output: Output.object({ schema: cvModelDocument }),
    maxOutputTokens: 6500,
    maxRetries: 0,
    ...(config.provider === "openai"
      ? { providerOptions: { openai: { store: false } } }
      : {}),
    abortSignal: AbortSignal.timeout(REVIEW_PROVIDER_TIMEOUT_MS),
  });
  return {
    output: result.output,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  };
};
export async function createCvDraft(
  reviewId: string,
  raw: PersonalCredentials & { requestKey: string; consent: true },
  provider: CvProvider = generateCv,
) {
  const config = credentials.parse(raw);
  const requestKey = z.string().uuid().parse(raw.requestKey);
  if (raw.consent !== true) throw new AppError("consent_required", 400);
  const review = await db.aiReview.findUnique({ where: { id: reviewId } });
  if (!review) throw new AppError("review_not_found", 404);
  const job = review.jobSnapshot as { description: string };
  const fingerprint = cvHash(
    JSON.stringify({
      reviewId,
      resume: review.resumeSnapshot,
      job,
      provider: config.provider,
      model: config.model,
      prompt: 1,
    }),
  );
  await expireReviews();
  const reservation = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId()},641020))`;
      const existing = await tx.aiCvDraft.findUnique({
        where: {
          workspaceId_requestKey: { workspaceId: workspaceId(), requestKey },
        },
      });
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new AppError("idempotency_conflict", 409);
        return { draft: existing, owner: false };
      }
      if (
        (await tx.aiReview.count({ where: { state: "pending" } })) ||
        (await tx.aiCvDraft.count({ where: { state: "pending" } }))
      )
        throw new AppError("ai_review_in_progress", 409);
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      const limit = Math.min(
        100,
        Math.max(1, Number(process.env.BYOK_DAILY_LIMIT) || 20),
      );
      if (
        (await tx.aiReview.count({ where: { createdAt: { gte: day } } })) +
          (await tx.aiCvDraft.count({ where: { createdAt: { gte: day } } })) >=
        limit
      )
        throw new AppError("ai_daily_limit", 429);
      return {
        draft: await tx.aiCvDraft.create({
          data: {
            reviewId,
            requestKey,
            fingerprint,
            provider: config.provider,
            model: config.model,
          },
        }),
        owner: true,
      };
    },
    { timeout: 15000 },
  );
  if (!reservation.owner) return reservation.draft;
  let inputTokens: number | undefined, outputTokens: number | undefined;
  try {
    const result = await provider(
      config,
      review.resumeSnapshot,
      job.description,
    );
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
    const document = validateCv(result.output, review.resumeSnapshot);
    return await db.aiCvDraft.update({
      where: { id: reservation.draft.id },
      data: {
        state: "succeeded",
        document: json(document),
        content: cvText(document),
        inputTokens,
        outputTokens,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    const code = personalProviderError(error);
    return db.aiCvDraft.update({
      where: { id: reservation.draft.id },
      data: {
        state: [
          "provider_timeout",
          "provider_failed_or_invalid_output",
        ].includes(code)
          ? "uncertain"
          : "failed",
        error: code,
        inputTokens,
        outputTokens,
        completedAt: new Date(),
      },
    });
  }
}
export async function saveCvDraft(
  id: string,
  input: { content: string; revision: number; approved: boolean },
) {
  const parsed = z
    .object({
      content: z.string().trim().min(50).max(50000),
      revision: z.number().int().min(1),
      approved: z.boolean(),
    })
    .strict()
    .parse(input);
  const current = await db.aiCvDraft.findUnique({ where: { id } });
  if (!current) throw new AppError("draft_not_found", 404);
  if (current.state !== "succeeded") throw new AppError("draft_not_ready", 409);
  const result = await db.aiCvDraft.updateMany({
    where: { id, revision: parsed.revision },
    data: {
      content: parsed.content,
      revision: { increment: 1 },
      approvedHash: parsed.approved ? cvHash(parsed.content) : null,
    },
  });
  if (!result.count) throw new AppError("revision_conflict", 409);
  return db.aiCvDraft.findUniqueOrThrow({ where: { id } });
}
