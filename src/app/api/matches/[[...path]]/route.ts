import { z } from "zod";
import { accountRequest } from "@/lib/account-request";
import { readJson } from "@/lib/http";
import { AppError } from "@/lib/contracts";
import {
  matchSettings,
  saveMatchSettings,
  matchDeck,
  matchCollection,
  decideMatch,
  undoMatch,
  prioritizeMatch,
  resetMatchLearning,
} from "@/lib/matches";
import { updateStudioApplication } from "@/lib/studio-application";
import { db } from "@/lib/db";
import { authorize } from "@/lib/authorization";
import { canUseMatches } from "@/lib/match-access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path?: string[] }> };
function handler(req: Request, context: Context) {
  return accountRequest(req, async () => {
    const session = await authorize(req.headers, req.method);
    if (!canUseMatches(session?.user))
      throw new AppError("matching_unavailable", 403);
    const path = (await context.params).path?.join("/") || "settings";
    const url = new URL(req.url);
    if (req.method === "GET") {
      if (path === "settings") return Response.json(await matchSettings());
      if (path === "deck")
        return Response.json(await matchDeck(url.searchParams));
      if (path === "collection") {
        const state = z
          .enum(["queued", "saved", "passed", "removed"])
          .parse(url.searchParams.get("state") || "queued");
        const page = z.coerce
          .number()
          .int()
          .min(1)
          .max(10000)
          .parse(url.searchParams.get("page") || 1);
        return Response.json(await matchCollection(state, page));
      }
    }
    if (req.method === "POST") {
      const input = await readJson(req);
      if (path === "preferences") {
        const data = z
          .object({
            values: z.unknown(),
            expectedRevision: z.number().int().min(0),
          })
          .strict()
          .parse(input);
        return Response.json(
          await saveMatchSettings(data.values, data.expectedRevision),
        );
      }
      if (path === "decision") return Response.json(await decideMatch(input));
      if (path === "undo")
        return Response.json(
          await undoMatch(
            z.object({ actionId: z.string().uuid() }).strict().parse(input)
              .actionId,
          ),
        );
      if (path === "priority") {
        const data = z
          .object({
            id: z.string().max(80),
            priority: z.number().int().min(0).max(2),
            expectedRevision: z.number().int().min(1),
          })
          .strict()
          .parse(input);
        return Response.json(
          await prioritizeMatch(data.id, data.priority, data.expectedRevision),
        );
      }
      if (path === "reset-learning") {
        z.object({}).strict().parse(input);
        return Response.json(await resetMatchLearning());
      }
      if (path === "application") {
        const data = z
          .object({
            id: z.string().max(80),
            action: z.enum(["prepare", "confirm_submission"]),
          })
          .strict()
          .parse(input);
        const row = await db.matchDecision.findUnique({
          where: { id: data.id },
        });
        if (!row || row.state !== "queued")
          throw new AppError("not_found", 404);
        return Response.json(
          await updateStudioApplication("catalog", row.catalogId, data.action),
        );
      }
    }
    throw new AppError("not_found", 404);
  });
}
export const GET = handler;
export const POST = handler;
