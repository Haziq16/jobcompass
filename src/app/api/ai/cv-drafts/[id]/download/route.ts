import { aiRequest } from "@/lib/ai-access";
import { db } from "@/lib/db";
import { AppError } from "@/lib/contracts";
import { apiError } from "@/lib/http";
import { cvHash } from "@/lib/tailored-cv";
import { cvDocumentBytes } from "@/lib/tailored-cv-document";
import { isOriginalCv } from "@/lib/original-cv-contracts";
import { ownedCvSource } from "@/lib/cv-source";
import { editDocx } from "@/lib/docx-template";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return aiRequest(req, async () => {
    try {
      const { id } = await params;
      const url = new URL(req.url);
      const draft = await db.aiCvDraft.findUnique({ where: { id } });
      if (!draft) throw new AppError("draft_not_found", 404);
      if (
        draft.state !== "succeeded" ||
        !draft.content ||
        draft.approvedHash !== cvHash(draft.content)
      )
        throw new AppError("cv_review_required", 409);
      if (Number(url.searchParams.get("revision")) !== draft.revision)
        throw new AppError("revision_conflict", 409);
      const format = url.searchParams.get("format");
      if (format !== "docx" && format !== "txt")
        throw new AppError("invalid_format", 400);
      const bytes =
        format === "docx"
          ? isOriginalCv(draft.document)
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
            : await cvDocumentBytes(draft.content)
          : Buffer.from(draft.content, "utf8");
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type":
            format === "docx"
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : "text/plain;charset=utf-8",
          "Content-Disposition": `attachment; filename="tailored-cv.${format}"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch (error) {
      return apiError(error);
    }
  });
}
