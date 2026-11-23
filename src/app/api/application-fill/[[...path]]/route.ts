import { z } from "@/lib/zod";
import { accountRequest } from "@/lib/account-request";
import { authorize } from "@/lib/authorization";
import { AppError } from "@/lib/contracts";
import { readJson } from "@/lib/http";
import {
  fillSetup,
  startFill,
  revokeFill,
  canUseFilling,
} from "@/lib/application-filling";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function handler(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  return accountRequest(req, async () => {
    const session = await authorize(req.headers, req.method);
    if (!canUseFilling(session?.user))
      throw new AppError("filling_unavailable", 403);
    const path = (await ctx.params).path?.join("/") || "setup";
    if (req.method === "GET" && path === "setup") {
      const id = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(new URL(req.url).searchParams.get("job"));
      return Response.json(await fillSetup(id));
    }
    if (req.method === "POST" && path === "start")
      return Response.json(await startFill(await readJson(req)));
    if (req.method === "POST" && path === "revoke") {
      const { id } = z
        .object({ id: z.string().min(1).max(100) })
        .strict()
        .parse(await readJson(req));
      return Response.json(await revokeFill(id));
    }
    throw new AppError("not_found", 404);
  });
}
export const GET = handler;
export const POST = handler;
