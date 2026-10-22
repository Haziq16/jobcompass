import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./contracts";
import { inspectDocx } from "./docx-template";
export const sameCv = (a: string, b: string) =>
  a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
export function sourceReference(checks: unknown) {
  const value = (
    checks as { sourceDocument?: { id?: string; sha256?: string } }
  )?.sourceDocument;
  return value?.id && value.sha256
    ? { id: value.id, sha256: value.sha256 }
    : null;
}
export async function ownedCvSource(id: string, resume?: string, sha?: string) {
  const asset = await db.resumeAsset.findUnique({ where: { id } });
  if (!asset) throw new AppError("cv_source_missing", 404);
  const bytes = Buffer.from(asset.bytes);
  if (
    (sha && asset.sha256 !== sha) ||
    createHash("sha256").update(bytes).digest("hex") !== asset.sha256
  )
    throw new AppError("cv_source_changed", 409);
  if (resume && !sameCv(asset.text, resume))
    throw new AppError("cv_source_mismatch", 409);
  return { ...asset, bytes };
}
export async function saveCvSource(
  bytes: Buffer,
  name: string,
  makeDefault = false,
  reviewId?: string,
) {
  if (!name.toLowerCase().endsWith(".docx"))
    throw new AppError("docx_required", 400);
  const inspection = await inspectDocx(bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const review = reviewId
    ? await db.aiReview.findUnique({ where: { id: reviewId } })
    : null;
  if (reviewId && !review) throw new AppError("review_not_found", 404);
  if (review && !sameCv(review.resumeSnapshot, inspection.text))
    throw new AppError("cv_source_mismatch", 409);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(640915)`;
    let asset = await tx.resumeAsset.findFirst({
      where: { sha256 },
      select: { id: true },
    });
    if (makeDefault)
      await tx.resumeAsset.updateMany({ data: { isDefault: false } });
    if (!asset)
      asset = await tx.resumeAsset.create({
        data: {
          name: name.slice(0, 200),
          bytes: new Uint8Array(bytes),
          sha256,
          text: inspection.text,
          isDefault: makeDefault,
        },
        select: { id: true },
      });
    else if (makeDefault)
      await tx.resumeAsset.update({
        where: { id: asset.id },
        data: { isDefault: true },
      });
    if (makeDefault)
      await tx.profile.upsert({
        where: { id: "owner" },
        create: { cvText: inspection.text },
        update: { cvText: inspection.text },
      });
    const sourceDocument = {
      id: asset.id,
      name: name.slice(0, 200),
      sha256,
      findings: inspection.findings,
      passed: inspection.passed,
      total: inspection.total,
    };
    if (review)
      await tx.aiReview.update({
        where: { id: review.id },
        data: {
          checks: {
            ...(review.checks as Prisma.JsonObject),
            sourceDocument,
          } as Prisma.InputJsonValue,
        },
      });
    return { text: inspection.text, truncated: false, sourceDocument };
  });
}
