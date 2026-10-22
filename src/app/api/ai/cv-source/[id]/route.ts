import { aiRequest } from "@/lib/ai-access";
import { apiError } from "@/lib/http";
import { ownedCvSource } from "@/lib/cv-source";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return aiRequest(req, async () => {
    try {
      const { id } = await params;
      const source = await ownedCvSource(id);
      return new Response(new Uint8Array(source.bytes), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": "attachment; filename=original-cv.docx",
          "Cache-Control": "private, no-store",
        },
      });
    } catch (e) {
      return apiError(e);
    }
  });
}
