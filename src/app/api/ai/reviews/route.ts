import { aiRequest } from "@/lib/ai-access";
import { db } from "@/lib/db";
import { createPersonalReview, expireReviews } from "@/lib/personal-ai";
import { reviewInput } from "@/lib/resume-review-contracts";
import { apiError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Keep this literal so Next.js can statically extract the hosting configuration.
export const maxDuration = 300;
export function POST(req: Request) {
  return aiRequest(req, async () => {
    try {
      const data = reviewInput.parse(await readJson(req));
      const run = await createPersonalReview(data);
      return Response.json(run, {
        status: run.state === "pending" ? 202 : 200,
      });
    } catch (error) {
      return apiError(error);
    }
  });
}
export function GET(req: Request) {
  return aiRequest(req, async () => {
    try {
      await expireReviews();
      const runs = await db.aiReview.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          provider: true,
          model: true,
          state: true,
          error: true,
          jobSnapshot: true,
          createdAt: true,
        },
      });
      return Response.json({
        reviews: runs.map((run) => {
          const job = run.jobSnapshot as { title: string; employer: string };
          return {
            ...run,
            jobSnapshot: { title: job.title, employer: job.employer },
          };
        }),
      });
    } catch (error) {
      return apiError(error);
    }
  });
}
