import { NextRequest } from "next/server";
import { z } from "zod";
import {
  companionOrigin,
  authorizeAttempt,
  recordAttempt,
} from "@/lib/companion";
import { AppError } from "@/lib/contracts";
import { apiError, readJson } from "@/lib/http";
import { documentBytes } from "@/lib/documents";
import { aiEnabled } from "@/lib/features";
export const dynamic = "force-dynamic";
async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  if (!aiEnabled())
    return Response.json({ error: "companion_deferred" }, { status: 410 });
  const origin = req.headers.get("origin") || "";
  if (!companionOrigin(req.headers))
    return Response.json({ error: "extension_not_allowed" }, { status: 403 });
  const cors = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Target-Url",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  try {
    const path = (await ctx.params).path;
    const token =
      req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    const target = req.headers.get("x-target-url") || "";
    const attempt = await authorizeAttempt(token, target);
    if (path[0] !== attempt.id) throw new AppError("invalid_grant", 401);
    if (req.method === "GET" || path[1] === "access") {
      const snapshot = attempt.snapshot as {
        fields: Record<string, string>;
        documents: { id: string; kind: string; content: string }[];
      };
      const documents = await Promise.all(
        snapshot.documents.map(async (d) => ({
          ...d,
          filename: `${d.kind}.docx`,
          base64: (await documentBytes(d.content, "docx")).toString("base64"),
        })),
      );
      return Response.json(
        {
          id: attempt.id,
          state: attempt.state,
          expiresAt: attempt.expiresAt,
          fields: snapshot.fields,
          documents,
        },
        { headers: cors },
      );
    }
    const data = z
      .object({
        state: z.enum([
          "filled",
          "paused",
          "final_review",
          "submitting",
          "uncertain",
        ]),
        unresolved: z.array(z.string().max(300)).max(100),
      })
      .strict()
      .parse(await readJson(req));
    await recordAttempt(attempt.id, data.state, data.unresolved);
    return Response.json({ ok: true }, { headers: cors });
  } catch (e) {
    const response = apiError(e);
    Object.entries(cors).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  }
}
export { handler as GET, handler as POST, handler as OPTIONS };
