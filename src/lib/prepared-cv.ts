import { createHash } from "node:crypto";
import { db } from "./db";
import { AppError } from "./contracts";
import { cvHash } from "./tailored-cv";
import { cvDocumentBytes } from "./tailored-cv-document";
import { isOriginalCv } from "./original-cv-contracts";
import { ownedCvSource } from "./cv-source";
import { editDocx } from "./docx-template";
export async function savePreparedCv(id: string, revision: number) {
  const draft = await db.aiCvDraft.findUnique({
    where: { id },
    include: { review: true },
  });
  if (!draft) throw new AppError("draft_not_found", 404);
  if (draft.revision !== revision) throw new AppError("revision_conflict", 409);
  if (
    draft.state !== "succeeded" ||
    !draft.content ||
    draft.approvedHash !== cvHash(draft.content)
  )
    throw new AppError("cv_review_required", 409);
  const bytes = isOriginalCv(draft.document)
    ? await editDocx(
        (
          await ownedCvSource(
            draft.document.sourceAssetId,
            undefined,
            draft.document.sourceSha256,
          )
        ).bytes,
        draft.document.paragraphs
          .filter((p) => p.text !== p.original)
          .map((p) => ({ id: p.id, text: p.text })),
      )
    : await cvDocumentBytes(draft.content);
  if (bytes.length > 2 * 1024 * 1024)
    throw new AppError("cv_under_2mb_required", 400);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = await db.resumeAsset.findFirst({
    where: { sha256 },
    select: { id: true, name: true },
  });
  if (existing) return existing;
  const job = draft.review.jobSnapshot as { title: string; employer: string };
  const label =
    `${job.title} ${job.employer}`
      .replace(/[^a-z0-9 -]/gi, "")
      .slice(0, 90)
      .trim() || "application";
  return db.resumeAsset.create({
    data: {
      name: `Tailored - ${label}.docx`,
      bytes: new Uint8Array(bytes),
      text: draft.content,
      sha256,
      isDefault: false,
    },
    select: { id: true, name: true },
  });
}
