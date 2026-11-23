import { createHash } from "node:crypto";
import { validateKeywordEvidence } from "./keyword-evidence";
import { Prisma } from "@prisma/client";
import { authDb, db } from "./db";
import { AppError } from "./contracts";
import { workspaceId } from "./workspace-context";
import {
  reviewInput,
  validateReview,
  type ReviewInput,
} from "./resume-review-contracts";
import {
  buildVerdict,
  reviewWithVerdictOutput,
  verdictColumns,
  type VerdictRecord,
} from "./apply-verdict";
import { declaredFacts, listingFreshness } from "./apply-verdict-context";
import { resumeChecks } from "./resume-checks";
import { REVIEW_INTERRUPTED_AFTER_MS } from "./personal-ai-timing";
import { ownedCvSource } from "./cv-source";
import { inspectDocx } from "./docx-template";
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
  await db.aiGeneration.updateMany({
    where: {
      state: "pending",
      createdAt: { lt: new Date(Date.now() - REVIEW_INTERRUPTED_AFTER_MS) },
    },
    data: { state: "uncertain", error: "interrupted", completedAt: new Date() },
  });
  await db.aiCvDraft.updateMany({
    where: {
      state: "pending",
      createdAt: { lt: new Date(Date.now() - REVIEW_INTERRUPTED_AFTER_MS) },
    },
    data: { state: "uncertain", error: "interrupted", completedAt: new Date() },
  });
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
  const keywordEvidence = validateKeywordEvidence(
    input.keywordEvidence,
    input.resumeText,
    job.description,
  );
  const sourceAsset = input.sourceAssetId
    ? await ownedCvSource(input.sourceAssetId, input.resumeText)
    : null;
  const sourceDocument = sourceAsset
    ? {
        id: sourceAsset.id,
        name: sourceAsset.name,
        sha256: sourceAsset.sha256,
        ...(await inspectDocx(sourceAsset.bytes)),
      }
    : null;
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        job,
        resume: input.resumeText,
        provider: input.provider,
        model: input.model,
        prompt: 2,
        ...(keywordEvidence.length ? { keywordEvidence } : {}),
        ...(sourceAsset
          ? { sourceAssetId: sourceAsset.id, sourceSha256: sourceAsset.sha256 }
          : {}),
      }),
    )
    .digest("hex");
  // Server-side verdict inputs. Neither is sent to the provider.
  const [declared, freshness] = await Promise.all([
    declaredFacts(),
    listingFreshness(input.source, input.jobId),
  ]);
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
      if (
        (await tx.aiReview.count({ where: { state: "pending" } })) ||
        (await tx.aiCvDraft.count({ where: { state: "pending" } })) ||
        (await tx.aiGeneration.count({ where: { state: "pending" } }))
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
          (await tx.aiCvDraft.count({ where: { createdAt: { gte: day } } })) +
          (await tx.aiGeneration.count({
            where: { createdAt: { gte: day } },
          })) >=
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
          checks: json({
            ...checks,
            ...(keywordEvidence.length ? { keywordEvidence } : {}),
            ...(sourceDocument
              ? {
                  sourceDocument: {
                    id: sourceDocument.id,
                    name: sourceDocument.name,
                    sha256: sourceDocument.sha256,
                    findings: sourceDocument.findings,
                    passed: sourceDocument.passed,
                    total: sourceDocument.total,
                  },
                }
              : {}),
          }),
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
    const { verdict: verdictOutput, ...reviewOnly } =
      reviewWithVerdictOutput.parse(result.output);
    const report = validateReview(
      reviewOnly,
      input.resumeText,
      job.description,
    );
    const verdict: VerdictRecord = verdictOutput
      ? buildVerdict(
          verdictOutput,
          report,
          input.resumeText,
          job.description,
          declared,
          freshness,
        )
      : { version: 1, state: "missing" };
    return await db.aiReview.update({
      where: { id: reservation.run.id },
      data: {
        state: "succeeded",
        report: json(report),
        verdict: json(verdict),
        ...verdictColumns(verdict),
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
