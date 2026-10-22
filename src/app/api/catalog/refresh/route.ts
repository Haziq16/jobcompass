import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { accountRequest } from "@/lib/account-request";
import { refreshCatalog } from "@/lib/catalog";
import { apiError } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;
// The scheduler holds only this single-purpose key, never database or user credentials.
export async function GET(req: Request) {
  const secret = process.env.CATALOG_REFRESH_SECRET;
  const auth = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret || ""}`;
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(auth) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
  )
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    if (new URL(req.url).searchParams.get("mode") === "expand") {
      const { expandCatalog } = await import("@/lib/catalog-expansion");
      return Response.json(await expandCatalog());
    }
    return Response.json(await refreshCatalog());
  } catch (error) {
    return apiError(error);
  }
}
export function POST(req: Request) {
  return accountRequest(req, async () => {
    if (
      process.env.JOBCOMPASS_TEST === "true" ||
      (process.env.JOBCOMPASS_BROWSER_CHECK_ID && !process.env.VERCEL)
    )
      return Response.json({ status: "test_refresh_disabled" });
    // One shared database lease bounds refreshes across every account and server instance.
    after(async () => {
      await refreshCatalog().catch(() =>
        console.error("catalog_refresh_failed"),
      );
    });
    return Response.json({ status: "checking_due_boards" }, { status: 202 });
  });
}
