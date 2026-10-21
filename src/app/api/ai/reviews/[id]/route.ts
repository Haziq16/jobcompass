import { aiRequest } from "@/lib/ai-access";
import { db } from "@/lib/db";
import { expireReviews } from "@/lib/personal-ai";
import { apiError } from "@/lib/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export function GET(req: Request, context: Context) {
  return aiRequest(req, async () => {
    try {
      const { id } = await context.params;
      await expireReviews();
      const run = await db.aiReview.findUnique({ where: { id } });
      return run
        ? Response.json(run)
        : Response.json({ error: "not_found" }, { status: 404 });
    } catch (error) {
      return apiError(error);
    }
  });
}
export function DELETE(req: Request, context: Context) {
  return aiRequest(req, async () => {
    try {
      const { id } = await context.params;
      const run = await db.aiReview.findUnique({ where: { id } });
      if (!run) return Response.json({ error: "not_found" }, { status: 404 });
      if (run.state === "pending")
        return Response.json(
          { error: "ai_review_in_progress" },
          { status: 409 },
        );
      await db.aiReview.delete({ where: { id } });
      return Response.json({ deleted: true });
    } catch (error) {
      return apiError(error);
    }
  });
}
