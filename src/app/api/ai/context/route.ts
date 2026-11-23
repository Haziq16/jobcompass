import { z } from "@/lib/zod";
import { aiRequest } from "@/lib/ai-access";
import { db } from "@/lib/db";
import { reviewTarget } from "@/lib/personal-ai";
import { apiError } from "@/lib/http";
import { sameCv } from "@/lib/cv-source";
import { inspectDocx } from "@/lib/docx-template";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(req: Request) {
  return aiRequest(req, async () => {
    try {
      const params = new URL(req.url).searchParams;
      const source = z
        .enum(["catalog", "workspace"])
        .parse(params.get("source") || "catalog");
      const id = params.get("jobId");
      const [profile, job] = await Promise.all([
        db.profile.findUnique({
          where: { id: "owner" },
          select: { cvText: true },
        }),
        id ? reviewTarget(source, z.string().min(1).max(150).parse(id)) : null,
      ]);
      const original = await db.resumeAsset.findFirst({
        where: {
          isDefault: true,
        },
        orderBy: { createdAt: "desc" },
      });
      const resumeText = profile?.cvText || original?.text || "";
      const inspection =
        original &&
        original.name.toLowerCase().endsWith(".docx") &&
        sameCv(resumeText, original.text)
          ? await inspectDocx(Buffer.from(original.bytes))
          : null;
      return Response.json({
        resumeText,
        sourceAssetId:
          original && sameCv(resumeText, original.text) ? original.id : null,
        job,
        sourceDocument:
          inspection && original
            ? {
                id: original.id,
                name: original.name,
                sha256: original.sha256,
                findings: inspection.findings,
                passed: inspection.passed,
                total: inspection.total,
              }
            : null,
      });
    } catch (error) {
      return apiError(error);
    }
  });
}
