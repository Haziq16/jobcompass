import { aiRequest } from "@/lib/ai-access";
import { db } from "@/lib/db";
import { AppError } from "@/lib/contracts";
import { apiError } from "@/lib/http";
import { ownedCvSource } from "@/lib/cv-source";
import { isOriginalCv } from "@/lib/original-cv-contracts";
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
      const draft = await db.aiCvDraft.findUnique({ where: { id } });
      if (!draft || !isOriginalCv(draft.document))
        throw new AppError("draft_not_found", 404);
      if (
        Number(new URL(req.url).searchParams.get("revision")) !== draft.revision
      )
        throw new AppError("revision_conflict", 409);
      const source = await ownedCvSource(
        draft.document.sourceAssetId,
        undefined,
        draft.document.sourceSha256,
      );
      const bytes = await editDocx(
        source.bytes,
        draft.document.paragraphs
          .filter((p) => p.text !== p.original)
          .map((p) => ({ id: p.id, text: p.text })),
      );
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Cache-Control": "private, no-store",
        },
      });
    } catch (e) {
      return apiError(e);
    }
  });
}
