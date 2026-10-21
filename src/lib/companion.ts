import { randomBytes } from "node:crypto";
import { db } from "./db";
import { AppError, safeUrl } from "./contracts";
import { factsSchema, assistantOutput } from "./assistant-contracts";
import { hash, json, reviewedFields } from "./assistant";
export function supportedTarget(url: string) {
  const u = new URL(url);
  return (
    (u.protocol === "https:" &&
      ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(
        u.hostname,
      )) ||
    (process.env.APP_ACCESS === "local" &&
      u.origin === "http://127.0.0.1:3000" &&
      u.pathname === "/fixtures/application")
  );
}
export { companionOrigin } from "./access";
export async function createAttempt(
  jobId: string,
  generationId: string,
  targetUrl: string,
) {
  if (!safeUrl(targetUrl) || !supportedTarget(targetUrl))
    throw new AppError("unsupported_form", 400);
  const token = randomBytes(32).toString("base64url");
  const attempt = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(640914)`;
    const job = await tx.job.findUniqueOrThrow({
      where: { id: jobId },
      include: { sources: true, application: true },
    });
    if (!job.application) throw new AppError("prepare_first", 409);
    const isFixture =
      process.env.APP_ACCESS === "local" &&
      new URL(targetUrl).origin === "http://127.0.0.1:3000" &&
      new URL(targetUrl).pathname === "/fixtures/application";
    const links = job.sources.flatMap((s) =>
      Array.isArray(s.applyLinks) ? (s.applyLinks as { url: string }[]) : [],
    );
    if (!isFixture && !links.some((l) => l.url === targetUrl))
      throw new AppError("target_not_in_job", 403);
    const latest = await tx.applicationAttempt.findFirst({
      where: { applicationId: job.application.id },
      orderBy: { createdAt: "desc" },
    });
    if (
      latest &&
      [
        "final_review",
        "submitting",
        "uncertain",
        "confirmed",
        "owner_reported_submitted",
      ].includes(latest.state)
    )
      throw new AppError("attempt_requires_resolution", 409);
    const generation = await tx.aiGeneration.findFirst({
      where: { id: generationId, jobId, state: "succeeded" },
      include: { drafts: true, profileVersion: true },
    });
    if (
      !generation ||
      generation.drafts.length !== 3 ||
      generation.drafts.some((d) => d.approvedHash !== hash(d.content))
    )
      throw new AppError("approved_documents_required", 409);
    await tx.applicationAttempt.updateMany({
      where: { applicationId: job.application.id, revokedAt: null },
      data: { revokedAt: new Date(), state: "revoked" },
    });
    const answersDraft = generation.drafts.find((d) => d.kind === "answers")!;
    const facts = factsSchema.parse(generation.profileVersion.facts);
    const structured =
      answersDraft.revision === 1
        ? assistantOutput.parse(generation.analysis).answers
        : [];
    const identityQuestion = (question: string) =>
      /firstname|lastname|fullname|givenname|familyname|surname|email|phone|linkedin|website|portfolio|dateofbirth|birthdate|passport|socialsecurity|password|^name$/.test(
        question.toLowerCase().replace(/[^a-z0-9]/g, ""),
      );
    const approvedAnswers = Object.fromEntries(
      structured.flatMap((a) =>
        a.evidence && !identityQuestion(a.question)
          ? [[a.question.toLowerCase(), a.evidence.quote]]
          : [],
      ),
    );
    const snapshot = {
      fields: {
        ...reviewedFields(
          answersDraft.revision === 1
            ? facts
            : facts.filter((f) => f.section === "contact"),
        ),
        ...approvedAnswers,
      },
      documents: generation.drafts.map((d) => ({
        id: d.id,
        kind: d.kind,
        revision: d.revision,
        hash: d.approvedHash,
        content: d.content,
      })),
      generationId,
    };
    const attempt = await tx.applicationAttempt.create({
      data: {
        applicationId: job.application.id,
        targetUrl,
        snapshot: json(snapshot),
        grantHash: hash(token),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    await tx.applicationEvent.create({
      data: {
        applicationId: job.application.id,
        status: job.application.status,
        kind: "attempt",
        message:
          "Scoped companion access issued for 10 minutes. No submission performed.",
      },
    });
    return attempt;
  });
  return { attempt, token };
}
export async function authorizeAttempt(token: string, targetUrl: string) {
  if (!token || token.length > 200) throw new AppError("invalid_grant", 401);
  const attempt = await db.applicationAttempt.findUnique({
    where: { grantHash: hash(token) },
    include: { application: true },
  });
  if (
    !attempt ||
    attempt.revokedAt ||
    attempt.expiresAt < new Date() ||
    attempt.targetUrl !== targetUrl ||
    !supportedTarget(targetUrl)
  )
    throw new AppError("invalid_grant", 401);
  const snapshot = attempt.snapshot as {
    documents: { id: string; hash: string }[];
  };
  for (const document of snapshot.documents) {
    const current = await db.documentDraft.findUnique({
      where: { id: document.id },
    });
    if (
      !current ||
      current.approvedHash !== document.hash ||
      hash(current.content) !== document.hash
    )
      throw new AppError("approval_changed", 409);
  }
  return attempt;
}
const transitions: Record<string, string[]> = {
  ready: ["filled", "paused"],
  filled: ["paused", "final_review"],
  paused: ["filled", "final_review"],
  final_review: ["paused", "submitting"],
  submitting: ["uncertain"],
  uncertain: [],
  confirmed: [],
};
export async function recordAttempt(
  id: string,
  state: string,
  unresolved: string[],
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(640914)`;
    const old = await tx.applicationAttempt.findUniqueOrThrow({
      where: { id },
      include: { application: true },
    });
    if (old.revokedAt || old.expiresAt < new Date())
      throw new AppError("invalid_grant", 401);
    if (state === old.state) return old;
    if (!transitions[old.state]?.includes(state))
      throw new AppError("invalid_attempt_transition", 409);
    if (state === "final_review" && unresolved.length)
      throw new AppError("unresolved_fields", 409);
    const changed = await tx.applicationAttempt.updateMany({
      where: { id, state: old.state, revokedAt: null },
      data: {
        state,
        evidence: json({
          unresolved,
          reportedAt: new Date().toISOString(),
          source: "companion",
        }),
      },
    });
    if (!changed.count) throw new AppError("attempt_conflict", 409);
    await tx.application.update({
      where: { id: old.applicationId },
      data: { preparationState: state === "paused" ? "action_needed" : state },
    });
    await tx.applicationEvent.create({
      data: {
        applicationId: old.applicationId,
        status: old.application.status,
        kind: "attempt",
        message: `Companion: ${state}.`,
        evidence: json({ unresolved }),
      },
    });
    return tx.applicationAttempt.findUniqueOrThrow({ where: { id } });
  });
}
// Only the controlled local form issues a server receipt; external clicks never confirm submission.
export async function fixtureReceipt(id: string, token: string) {
  if (process.env.APP_ACCESS !== "local") throw new AppError("not_found", 404);
  const before = await authorizeAttempt(
    token,
    "http://127.0.0.1:3000/fixtures/application",
  );
  if (before.id !== id) throw new AppError("invalid_grant", 401);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(640914)`;
    const attempt = await tx.applicationAttempt.findUniqueOrThrow({
      where: { id },
      include: { application: true },
    });
    if (attempt.revokedAt || attempt.expiresAt < new Date())
      throw new AppError("invalid_grant", 401);
    if (!["final_review", "submitting"].includes(attempt.state))
      throw new AppError("final_review_required", 409);
    const receipt = randomBytes(16).toString("hex");
    await tx.applicationAttempt.update({
      where: { id },
      data: {
        state: "confirmed",
        revokedAt: new Date(),
        evidence: json({
          source: "controlled_form_server",
          receipt,
          at: new Date().toISOString(),
        }),
      },
    });
    // Fixture confirmation must never modify employer outcome/Applied status.
    await tx.application.update({
      where: { id: attempt.applicationId },
      data: { preparationState: "fixture_confirmed" },
    });
    await tx.applicationEvent.create({
      data: {
        applicationId: attempt.applicationId,
        status: attempt.application.status,
        kind: "fixture_receipt",
        message:
          "Controlled test form accepted; no employer application was sent.",
        evidence: json({ receipt }),
      },
    });
    return receipt;
  });
}
