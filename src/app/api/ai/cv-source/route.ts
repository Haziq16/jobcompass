import { aiRequest } from "@/lib/ai-access";
import { AppError } from "@/lib/contracts";
import { apiError, boundedBytes } from "@/lib/http";
import { saveCvSource } from "@/lib/cv-source";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function POST(req: Request) {
  return aiRequest(req, async () => {
    try {
      const raw = await boundedBytes(req, 3 * 1024 * 1024 + 12000);
      const form = await new Response(raw, {
        headers: { "Content-Type": req.headers.get("content-type") || "" },
      }).formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError("docx_required", 400);
      const reviewId = form.get("reviewId");
      if (reviewId && String(reviewId).length > 150)
        throw new AppError("invalid_input", 400);
      return Response.json(
        await saveCvSource(
          Buffer.from(await file.arrayBuffer()),
          file.name,
          form.get("default") === "true",
          reviewId ? String(reviewId) : undefined,
        ),
      );
    } catch (e) {
      return apiError(e);
    }
  });
}
