import { z } from "@/lib/zod";
import { aiRequest } from "@/lib/ai-access";
import { db } from "@/lib/db";
import { AppError } from "@/lib/contracts";
import { apiError, readJson } from "@/lib/http";
import {
  connectionInput,
  resolvePersonalCredentials,
} from "@/lib/personal-ai-connection";
import { createCvDraft } from "@/lib/tailored-cv";
import { expireReviews } from "@/lib/personal-ai";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };
export function GET(req: Request, { params }: Context) {
  return aiRequest(req, async () => {
    try {
      const { id } = await params;
      if (
        !(await db.aiReview.findUnique({ where: { id }, select: { id: true } }))
      )
        throw new AppError("review_not_found", 404);
      await expireReviews();
      return Response.json({
        drafts: await db.aiCvDraft.findMany({
          where: { reviewId: id },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      });
    } catch (error) {
      return apiError(error);
    }
  });
}
export function POST(req: Request, { params }: Context) {
  return aiRequest(req, async () => {
    try {
      const { id } = await params;
      const data = connectionInput
        .extend({
          requestKey: z.string().uuid(),
          consent: z.literal(true),
          layout: z.enum(["original", "clean"]).optional(),
        })
        .strict()
        .parse(await readJson(req));
      const config = await resolvePersonalCredentials(data);
      const draft = await createCvDraft(id, {
        ...config,
        requestKey: data.requestKey,
        consent: data.consent,
        layout: data.layout,
      });
      return Response.json(draft, {
        status: draft.state === "pending" ? 202 : 200,
      });
    } catch (error) {
      return apiError(error);
    }
  });
}
