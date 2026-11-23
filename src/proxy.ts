import { NextResponse, type NextRequest } from "next/server";
import { companionId } from "./lib/application-fill-contracts";
import { accessAllowed } from "./lib/access";
// Report-only for now: violations appear in the browser console and the browser
// tests fail on them, but nothing is blocked. Inline scripts/styles are allowed
// because Next.js bootstrap scripts and the sandboxed DOCX preview need them;
// enforcing would move scripts to per-request nonces (see docs/security-headers.md).
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const permissionsPolicy = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "serial=()",
  "hid=()",
  "bluetooth=()",
  "display-capture=()",
  "clipboard-read=()",
  "clipboard-write=(self)",
].join(", ");
export function proxy(request: NextRequest) {
  const scopedExtension =
    request.nextUrl.pathname.startsWith("/api/fill-companion/") &&
    request.headers.get("origin") === "chrome-extension://" + companionId;
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
  response.headers.set(
    "Content-Security-Policy-Report-Only",
    contentSecurityPolicy,
  );
  response.headers.set("Permissions-Policy-Report-Only", permissionsPolicy);
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
