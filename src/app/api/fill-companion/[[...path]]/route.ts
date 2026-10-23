import { reserveSubmission, recordOutcome } from "@/lib/automation";
import { AppError } from "@/lib/contracts";
import { apiError, readJson } from "@/lib/http";
import { companionId } from "@/lib/application-fill-contracts";
import { withFillGrant, planFill, reportFill } from "@/lib/application-filling";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handler(
  req: Request,
  ctx: { params: Promise<{ path?: string[] }> },
) {
  const origin = "chrome-extension://" + companionId;
  if (req.headers.get("origin") !== origin)
    return Response.json({ error: "extension_not_allowed" }, { status: 403 });
  const cors = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Target-Url",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  try {
    const [id, action, ...rest] = (await ctx.params).path || [];
    if (
      !id ||
      rest.length ||
      !["scan", "report", "submit", "outcome"].includes(action)
    )
      throw new AppError("not_found", 404);
    const token =
        req.headers.get("authorization")?.replace(/^Bearer /, "") || "",
      target = req.headers.get("x-target-url") || "";
    const input = await readJson(req);
    const result = await withFillGrant(
      token,
      target,
      async (grantedId) => {
        if (id !== grantedId) throw new AppError("invalid_grant", 401);
        return action === "scan"
          ? planFill(id, input)
          : action === "report"
            ? reportFill(id, input)
            : action === "submit"
              ? reserveSubmission(id, input)
              : recordOutcome(id, input);
      },
      action === "outcome",
    );
    return Response.json(result, { headers: cors });
  } catch (e) {
    const response = apiError(e);
    Object.entries(cors).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  }
}
export const POST = handler;
export const OPTIONS = handler;
