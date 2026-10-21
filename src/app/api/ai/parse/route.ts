import { aiRequest } from "@/lib/ai-access";
import { boundedBytes, apiError } from "@/lib/http";
import { extractCv } from "@/lib/cv";
import { resumeChecks } from "@/lib/resume-checks";
import { AppError } from "@/lib/contracts";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function POST(req: Request) {
  return aiRequest(req, async () => {
    try {
      const bytes = await boundedBytes(req, 3_300_000);
      const form = await new Response(bytes as BodyInit, {
        headers: { "Content-Type": req.headers.get("content-type") || "" },
      }).formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size > 3 * 1024 * 1024)
        throw new AppError("cv_too_large", 413);
      const text = await extractCv(
        Buffer.from(await file.arrayBuffer()),
        file.name,
      );
      return Response.json({
        text,
        checks: resumeChecks(text),
        truncated: text.length > 40000,
      });
    } catch (error) {
      return apiError(error);
    }
  });
}
