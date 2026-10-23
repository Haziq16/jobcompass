import {
  swipeApplicationContext,
  swipeApplicationConsent,
} from "@/lib/swipe-application-consent";
import { z } from "zod";
import { accountRequest } from "@/lib/account-request";
import { authorize } from "@/lib/authorization";
import { AppError } from "@/lib/contracts";
import { readJson } from "@/lib/http";
import { db } from "@/lib/db";
import { resolvedApplicationReadiness } from "@/lib/application-readiness";
import {
  canUseAutomation,
  automationOverview,
  saveAutomation,
  retryAutomation,
  resolveSubmission,
  enqueueAutomation,
} from "@/lib/automation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function handler(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  return accountRequest(req, async () => {
    const user = (await authorize(req.headers, req.method))?.user;
    if (!canUseAutomation(user))
      throw new AppError("automation_unavailable", 403);
    const path = (await ctx.params).path?.join("/") || "overview";
    if (req.method === "GET" && path === "consent") {
      const id = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(new URL(req.url).searchParams.get("job"));
      const job = await db.catalogJob.findUnique({ where: { id } });
      if (!job) throw new AppError("not_found", 404);
      const readiness = await resolvedApplicationReadiness(job,id,true);
      return Response.json({
        readiness,
        applicationConsent: readiness.automatic ? swipeApplicationConsent(
          job,
          await swipeApplicationContext(),
        ) : null,
      });
    }
    if (req.method === "GET" && path === "overview")
      return Response.json(await automationOverview());
    if (req.method === "POST") {
      const input = await readJson(req);
      if (path === "settings") {
        const data = z
          .object({
            values: z.unknown(),
            expectedRevision: z.number().int().min(0),
            includeExisting: z.boolean().default(false),
          })
          .strict()
          .parse(input);
        return Response.json(
          await saveAutomation(
            data.values,
            data.expectedRevision,
            data.includeExisting,
          ),
        );
      }
      if (path === "retry") {
        const data = z
          .object({ id: z.string().max(100) })
          .strict()
          .parse(input);
        return Response.json(await retryAutomation(data.id));
      }
      if (path === "enqueue") {
        const data = z
          .object({ catalogId: z.string().regex(/^[a-f0-9]{64}$/) })
          .strict()
          .parse(input);
        return Response.json(await enqueueAutomation(data.catalogId));
      }
      if (path === "resolve") {
        const data = z
          .object({
            id: z.string().max(100),
            revision: z.number().int().min(1),
            submitted: z.boolean(),
            checked: z.literal(true),
          })
          .strict()
          .parse(input);
        return Response.json(
          await resolveSubmission(data.id, data.revision, data.submitted),
        );
      }
      if (path === "seen") {
        await db.automationEvent.updateMany({
          where: { seenAt: null },
          data: { seenAt: new Date() },
        });
        return Response.json({ ok: true });
      }
    }
    throw new AppError("not_found", 404);
  });
}
export const GET = handler;
export const POST = handler;
