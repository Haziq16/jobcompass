import { type NextRequest, NextResponse } from "next/server";
import { ownerAuth } from "@/lib/auth";
import { accessAllowed } from "@/lib/access";
import { authorize } from "@/lib/authorization";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handler(request: NextRequest) {
  if (
    process.env.APP_ACCESS !== "hosted" ||
    !accessAllowed(request.headers, request.method)
  )
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const endpoint = request.nextUrl.pathname.slice("/api/auth/".length);
  if (
    ![
      "sign-in/email",
      ...(process.env.PUBLIC_SIGNUP === "true" ? ["sign-up/email"] : []),
      "sign-out",
      "get-session",
      "change-password",
      "ok",
    ].includes(endpoint)
  )
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (Number(request.headers.get("content-length") || 0) > 16000)
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  try {
    if (request.method === "POST") {
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader)
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16000) {
            await reader.cancel();
            return NextResponse.json(
              { error: "payload_too_large" },
              { status: 413 },
            );
          }
          chunks.push(value);
        }
      const safeRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: Buffer.concat(chunks),
      });
      if (
        endpoint === "sign-in/email" &&
        process.env.PUBLIC_SIGNUP !== "true"
      ) {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const email =
          typeof body?.email === "string"
            ? body.email.trim().toLowerCase()
            : "";
        if (!email || email !== process.env.OWNER_EMAIL?.trim().toLowerCase())
          return NextResponse.json(
            { error: "unauthenticated" },
            { status: 401 },
          );
      }
      if (["get-session", "change-password"].includes(endpoint))
        await authorize(request.headers, request.method);
      return await ownerAuth().handler(safeRequest);
    }
    if (["get-session", "change-password"].includes(endpoint))
      await authorize(request.headers, request.method);
    return await ownerAuth().handler(request);
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
}
export { handler as GET, handler as POST };
