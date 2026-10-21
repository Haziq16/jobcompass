import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { authDb, db } from "./db";
import { AppError } from "./contracts";
import { workspaceId } from "./workspace-context";
import {
  reviewInput,
  reviewOutput,
  validateReview,
  type ReviewInput,
} from "./resume-review-contracts";
import { resumeChecks } from "./resume-checks";
import { REVIEW_INTERRUPTED_AFTER_MS } from "./personal-ai-timing";
import {
  personalProviderError,
  runPersonalReview,
  type ReviewProvider,
} from "./personal-ai-provider";
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function reviewTarget(
  source: "catalog" | "workspace",
  id: string,
) {
  const job =
    source === "catalog"
      ? await authDb.catalogJob.findUnique({
          where: { id },
          select: {
            id: true,
            title: true,
            employer: true,
            description: true,
            location: true,
          },
        })
      : await db.job.findUnique({
          where: { id },
          select: {
            id: true,
            title: true,
            employer: true,
            description: true,
            location: true,
          },
        });
  if (!job) throw new AppError("job_not_found", 404);
  return {
    ...job,
    source,
    description: (job.description || "").slice(0, 35000),
  };
}
export async function expireReviews() {
  await db.aiReview.updateMany({
    where: {
      state: "pending",
      createdAt: { lt: new Date(Date.now() - REVIEW_INTERRUPTED_AFTER_MS) },
    },
    data: { state: "uncertain", error: "interrupted", completedAt: new Date() },
  });
}
export async function createPersonalReview(
  raw: ReviewInput,
  provider: ReviewProvider = runPersonalReview,
) {
  const input = reviewInput.parse(raw);
  const job = await reviewTarget(input.source, input.jobId);
  if (job.description.trim().length < 100)
    throw new AppError("job_description_required", 409);
  const checks = resumeChecks(input.resumeText, job.description);
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        job,
        resume: input.resumeText,
        provider: input.provider,
        model: input.model,
        prompt: 1,
      }),
    )
    .digest("hex");
  await expireReviews();
  const reservation = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId()},641020))`;
      const existing = await tx.aiReview.findUnique({
        where: {
          workspaceId_requestKey: {
            workspaceId: workspaceId(),
            requestKey: input.requestKey,
          },
        },
      });
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new AppError("idempotency_conflict", 409);
        return { run: existing, owner: false };
      }
      if (await tx.aiReview.count({ where: { state: "pending" } }))
        throw new AppError("ai_review_in_progress", 409);
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      const limit = Math.min(
        100,
        Math.max(1, Number(process.env.BYOK_DAILY_LIMIT) || 20),
      );
      if (
        (await tx.aiReview.count({ where: { createdAt: { gte: day } } })) >=
        limit
      )
        throw new AppError("ai_daily_limit", 429);
      const run = await tx.aiReview.create({
        data: {
          requestKey: input.requestKey,
          fingerprint,
          provider: input.provider,
          model: input.model,
          jobSnapshot: json(job),
          resumeSnapshot: input.resumeText,
          checks: json(checks),
        },
      });
      return { run, owner: true };
    },
    { timeout: 15000 },
  );
  if (!reservation.owner) return reservation.run;
  let inputTokens: number | undefined, outputTokens: number | undefined;
  try {
    const result = await provider(
      { provider: input.provider, model: input.model, apiKey: input.apiKey },
      input.resumeText,
      job.description,
    );
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
    const report = validateReview(
      reviewOutput.parse(result.output),
      input.resumeText,
      job.description,
    );
    return await db.aiReview.update({
      where: { id: reservation.run.id },
      data: {
        state: "succeeded",
        report: json(report),
        inputTokens,
        outputTokens,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    const code = personalProviderError(error);
    return db.aiReview.update({
      where: { id: reservation.run.id },
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
