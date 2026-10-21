import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { workspaceId } from "./workspace-context";
import { AppError } from "./contracts";
import {
  factsSchema,
  assistantOutput,
  validateGrounding,
  type Fact,
} from "./assistant-contracts";
import {
  aiConfiguration,
  GatewayAssistant,
  type AssistantProvider,
} from "./ai-provider";
export const hash = (text: string | Uint8Array) =>
  createHash("sha256").update(text).digest("hex");
export const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function prepare(jobId: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(640914)`;
    const previous = await tx.application.findUnique({ where: { jobId } });
    const app = await tx.application.upsert({
      where: { jobId },
      create: { jobId, status: "Preparing", preparationState: "drafting" },
      update: {},
    });
    if (app.preparationState === "not_started")
      await tx.application.update({
        where: { id: app.id },
        data: { preparationState: "drafting" },
      });
    if (!previous || previous.preparationState === "not_started")
      await tx.applicationEvent.create({
        data: {
          applicationId: app.id,
          status: app.status,
          kind: "preparation",
          message: "Application preparation started. Nothing submitted.",
        },
      });
    return app;
  });
}
export async function generateApplication(
  jobId: string,
  requestKey: string,
  questions: string[],
  language = "en",
  provider?: AssistantProvider,
) {
  const config = aiConfiguration();
  if (!provider && !config.configured)
    throw new AppError("ai_setup_required", 503);
  const profile = await db.profileVersion.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!profile) throw new AppError("reviewed_profile_required", 409);
  const facts = factsSchema.parse(profile.facts);
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  const snapshot = {
    id: job.id,
    title: job.title,
    employer: job.employer,
    description: (job.description || "").slice(0, 35000),
    qualifications: job.qualifications,
  };
  const resume = await db.resumeAsset.findFirst({
    where: { isDefault: true },
    select: { id: true, sha256: true },
  });
  const settings = {
    language,
    model: provider ? "fixture" : config.model,
    questions,
    promptVersion: 1,
    resume,
    inputRate: config.inputRate,
    outputRate: config.outputRate,
    maxOutputTokens: config.maxOutputTokens,
  };
  const fingerprint = hash(
    JSON.stringify({ snapshot, profile: profile.id, settings }),
  );
  const input = { facts, job: snapshot, questions, language };
  if (JSON.stringify(input).length > 120000)
    throw new AppError("reviewed_profile_too_large", 400);
  const estimate = Math.ceil((JSON.stringify(input).length + 1800) / 3);
  const reservation = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(640913)`;
    const replay = await tx.aiGeneration.findUnique({
      where: {
        workspaceId_requestKey: { workspaceId: workspaceId(), requestKey },
      },
    });
    if (replay && replay.fingerprint !== fingerprint)
      throw new AppError("idempotency_conflict", 409);
    const existing =
      replay ||
      (await tx.aiGeneration.findUnique({
        where: {
          workspaceId_fingerprint: { workspaceId: workspaceId(), fingerprint },
        },
      }));
    if (existing) return { run: existing, owner: false };
    // Interrupted calls stay counted and cannot be retried with a new key.
    await tx.aiGeneration.updateMany({
      where: {
        state: "pending",
        createdAt: { lt: new Date(Date.now() - 120000) },
      },
      data: { state: "uncertain", error: "interrupted" },
    });
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    if (
      (await tx.aiGeneration.count({ where: { createdAt: { gte: day } } })) >=
      config.dailyLimit
    )
      throw new AppError("ai_daily_limit", 429);
    const run = await tx.aiGeneration.create({
      data: {
        jobId,
        requestKey,
        fingerprint,
        profileVersionId: profile.id,
        jobSnapshot: json(snapshot),
        settings: json(settings),
        estimatedInputTokens: estimate,
        maxOutputTokens: config.maxOutputTokens,
        estimatedCost:
          config.inputRate !== null && config.outputRate !== null
            ? (estimate * config.inputRate + 3000 * config.outputRate) / 1e6
            : null,
      },
    });
    return { run, owner: true };
  });
  if (!reservation.owner) return reservation.run;
  const run = reservation.run;
  await prepare(jobId);
  try {
    const result = await (provider || new GatewayAssistant()).generate(input);
    const output = validateGrounding(
      assistantOutput.parse(result.output),
      facts,
      [snapshot.description, ...snapshot.qualifications].join("\n"),
      questions,
    );
    const quotes = (items: { factId: string; quote: string }[]) =>
      items.map((q) => `- ${q.quote}`).join("\n");
    const answerText = output.answers
      .map(
        (a) =>
          `${a.question}\n${a.evidence?.quote || "UNRESOLVED - add a reviewed answer to your profile."}`,
      )
      .join("\n\n");
    const drafts = [
      {
        kind: "resume",
        content: `Resume for ${job.title} at ${job.employer}\n\n${quotes(output.resume)}`,
        citations: output.resume,
      },
      {
        kind: "cover_letter",
        content: `Application for ${job.title} at ${job.employer}\n\nRelevant experience from my reviewed profile:\n${quotes(output.coverLetter)}\n\nThank you for considering my application.`,
        citations: output.coverLetter,
      },
      {
        kind: "answers",
        content: answerText || "No application questions supplied.",
        citations: output.answers.flatMap((a) =>
          a.evidence ? [a.evidence] : [],
        ),
      },
    ];
    return await db.$transaction(async (tx) => {
      await tx.documentDraft.createMany({
        data: drafts.map((d) => ({
          ...d,
          citations: json(d.citations),
          generationId: run.id,
        })),
      });
      const app = await tx.application.update({
        where: { jobId },
        data: { preparationState: "review" },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId: app.id,
          status: app.status,
          kind: "documents",
          message: "Grounded drafts generated; review required.",
        },
      });
      return tx.aiGeneration.update({
        where: { id: run.id },
        data: {
          state: "succeeded",
          analysis: json(output),
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          actualCost:
            config.inputRate !== null &&
            config.outputRate !== null &&
            result.inputTokens !== undefined &&
            result.outputTokens !== undefined
              ? (result.inputTokens * config.inputRate +
                  result.outputTokens * config.outputRate) /
                1e6
              : null,
          completedAt: new Date(),
        },
      });
    });
  } catch (error) {
    const code =
      error instanceof AppError ? error.code : "ai_failed_or_uncertain";
    await db.aiGeneration.update({
      where: { id: run.id },
      data: {
        state: code === "ai_failed_or_uncertain" ? "uncertain" : "failed",
        error: code,
        completedAt: new Date(),
      },
    });
    throw new AppError(code, 502);
  }
}
export async function editDraft(id: string, content: string, revision: number) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(640914)`;
    const draft = await tx.documentDraft.findUniqueOrThrow({
      where: { id },
      include: { generation: true },
    });
    const changed = await tx.documentDraft.updateMany({
      where: { id, revision },
      data: {
        content,
        revision: { increment: 1 },
        approvedHash: null,
        approvedAt: null,
      },
    });
    if (!changed.count) throw new AppError("revision_conflict", 409);
    const app = await tx.application.update({
      where: { jobId: draft.generation.jobId },
      data: { preparationState: "review" },
    });
    await tx.applicationAttempt.updateMany({
      where: {
        applicationId: app.id,
        state: { in: ["ready", "filled", "paused"] },
      },
      data: { revokedAt: new Date(), state: "revoked" },
    });
    await tx.applicationAttempt.updateMany({
      where: { applicationId: app.id, state: "final_review" },
      data: { revokedAt: new Date(), state: "uncertain" },
    });
    await tx.applicationEvent.create({
      data: {
        applicationId: app.id,
        status: app.status,
        kind: "documents",
        message: `${draft.kind} edited; approval invalidated.`,
      },
    });
  });
}
export async function approveDraft(id: string, revision: number) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(640914)`;
    const draft = await tx.documentDraft.findUniqueOrThrow({
      where: { id },
      include: { generation: true },
    });
    if (draft.revision !== revision)
      throw new AppError("revision_conflict", 409);
    const changed = await tx.documentDraft.updateMany({
      where: { id, revision },
      data: { approvedHash: hash(draft.content), approvedAt: new Date() },
    });
    if (!changed.count) throw new AppError("revision_conflict", 409);
    const remaining = await tx.documentDraft.count({
      where: { generationId: draft.generationId, approvedHash: null },
    });
    const app = await tx.application.update({
      where: { jobId: draft.generation.jobId },
      data: { preparationState: remaining ? "review" : "approved" },
    });
    await tx.applicationEvent.create({
      data: {
        applicationId: app.id,
        status: app.status,
        kind: "approval",
        message: `Owner approved ${draft.kind} revision ${revision}.`,
      },
    });
  });
}
export function reviewedFields(facts: Fact[]) {
  return Object.fromEntries(
    facts
      .filter((f) => f.section === "contact" || f.section === "answers")
      .map((f) => [f.label.toLowerCase(), f.text]),
  );
}
