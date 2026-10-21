import { NextResponse, type NextRequest } from "next/server";
import { accessAllowed, companionOrigin } from "./lib/access";
export function proxy(request: NextRequest) {
  const scopedExtension =
    request.nextUrl.pathname.startsWith("/api/companion/") &&
    companionOrigin(request.headers);
  const accessHeaders = new Headers(request.headers);
  if (scopedExtension) {
    accessHeaders.delete("sec-fetch-site");
    accessHeaders.set(
      "origin",
      process.env.APP_ACCESS === "hosted"
        ? process.env.APP_URL || ""
        : `http://${request.headers.get("host")}`,
    );
  }
  if (!accessAllowed(accessHeaders, request.method))
    return new NextResponse(
      "JobCompass access is not configured for this address.",
      { status: 403 },
    );
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
