import { z } from "zod";
import { aiRequest } from "@/lib/ai-access";
import { db } from "@/lib/db";
import { AppError } from "@/lib/contracts";
import { apiError, readJson } from "@/lib/http";
import { saveCvDraft } from "@/lib/tailored-cv";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export function PATCH(req: Request, { params }: Context) {
  return aiRequest(req, async () => {
    try {
      const { id } = await params;
      const data = z
        .object({
          content: z.string().min(50).max(50000),
          revision: z.number().int().min(1),
          approved: z.boolean(),
        })
        .strict()
        .parse(await readJson(req));
      return Response.json(await saveCvDraft(id, data));
    } catch (error) {
      return apiError(error);
    }
  });
}
export function DELETE(req: Request, { params }: Context) {
  return aiRequest(req, async () => {
    try {
      const { id } = await params;
      const draft = await db.aiCvDraft.findUnique({ where: { id } });
      if (!draft) throw new AppError("draft_not_found", 404);
      if (draft.state === "pending")
        throw new AppError("ai_review_in_progress", 409);
      await db.aiCvDraft.delete({ where: { id } });
      return Response.json({ deleted: true });
    } catch (error) {
      return apiError(error);
    }
  });
}
