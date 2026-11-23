import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./contracts";
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
