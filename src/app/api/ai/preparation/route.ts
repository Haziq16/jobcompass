import { z } from "@/lib/zod";
import { aiRequest } from "@/lib/ai-access";
import { db } from "@/lib/db";
import { reviewTarget } from "@/lib/personal-ai";
import { resumeChecks } from "@/lib/resume-checks";
import { getCandidate } from "@/lib/application-memory";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return aiRequest(req, async () => {
    const params = new URL(req.url).searchParams;
    const source = z
      .enum(["catalog", "workspace"])
      .parse(params.get("source") || "catalog");
    const jobId = z.string().min(1).max(150).parse(params.get("jobId"));
    const job = await reviewTarget(source, jobId);
    const [resumes, profile, reviews] = await Promise.all([
      db.resumeAsset.findMany({
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        take: 40,
        select: { id: true, name: true, isDefault: true },
      }),
      getCandidate(),
      db.aiReview.findMany({
        where: { jobSnapshot: { path: ["id"], equals: jobId } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, state: true, createdAt: true },
      }),
    ]);
    const requested =
      params.get("resumeId") ||
      profile.values.cvSource?.assetId ||
      resumes[0]?.id;
    const selected =
      requested && resumes.some((r) => r.id === requested)
        ? await db.resumeAsset.findUnique({
            where: { id: requested },
            select: { id: true, name: true, text: true },
          })
        : null;
    return Response.json({
      job,
      resumes,
      selected,
      checks: resumeChecks(selected?.text || "", job.description),
      reviews,
    });
  });
}
