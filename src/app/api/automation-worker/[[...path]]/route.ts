import { z } from "zod";
import { apiError, readJson } from "@/lib/http";
import {
  workerAuthorized,
  workerPending,
  recordWorkerHeartbeat,
  claimAutomation,
  withWorkerLease,
  reserveSubmission,
  recordOutcome,
  finishAutomation,
} from "@/lib/automation";
import { withFillGrant, planFill, reportFill } from "@/lib/application-filling";
import { AppError } from "@/lib/contracts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function handler(
  req: Request,
  ctx: { params: Promise<{ path?: string[] }> },
) {
  if (!workerAuthorized(req.headers))
    return Response.json(
      { error: "worker_not_authorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const path = (await ctx.params).path?.join("/");
    if (req.method === "POST" && path === "heartbeat") {
      const data=z.object({mode:z.enum(["local","scheduled"])}).strict().parse(await readJson(req));
      return Response.json(await recordWorkerHeartbeat(data.mode),{headers:{"Cache-Control":"no-store"}});
    }
    if (req.method === "GET" && path === "pending")
      return Response.json({ pending: await workerPending() });
    if (req.method === "POST" && path === "claim")
      return Response.json({ task: await claimAutomation() });
    if (req.method !== "POST") throw new AppError("not_found", 404);
    const input = z
      .object({
        taskId: z.string().max(100),
        leaseToken: z.string().max(100),
        grantToken: z.string().max(100),
        targetUrl: z.string().max(2000),
        payload: z.unknown(),
      })
      .strict()
      .parse(await readJson(req));
    const result = await withWorkerLease(
      input.taskId,
      input.leaseToken,
      async (sessionId) =>
        withFillGrant(
          input.grantToken,
          input.targetUrl,
          async (grantedId) => {
            if (grantedId !== sessionId)
              throw new AppError("invalid_grant", 401);
            if (path === "scan") return planFill(sessionId, input.payload);
            if (path === "report") return reportFill(sessionId, input.payload);
            if (path === "submit")
              return reserveSubmission(sessionId, input.payload);
            if (path === "outcome")
              return recordOutcome(sessionId, input.payload);
            if (path === "finish") {
              const data = z
                .object({ error: z.string().max(300).optional() })
                .strict()
                .parse(input.payload);
              return finishAutomation(sessionId, data.error);
            }
            throw new AppError("not_found", 404);
          },
          path === "outcome" || path === "finish",
        ),
      path === "outcome" || path === "finish",
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
export const GET = handler;
export const POST = handler;
