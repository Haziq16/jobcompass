import { z } from "zod";
import { aiRequest } from "@/lib/ai-access";
import { db } from "@/lib/db";
import { reviewTarget } from "@/lib/personal-ai";
import { apiError } from "@/lib/http";
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
      return Response.json({ resumeText: profile?.cvText || "", job });
    } catch (error) {
      return apiError(error);
    }
  });
}
