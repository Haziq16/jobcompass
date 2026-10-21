export function companionOrigin(headers: Headers) {
  const id = process.env.COMPANION_EXTENSION_ID;
  return Boolean(
    id &&
    /^[a-p]{32}$/.test(id) &&
    headers.get("origin") === `chrome-extension://${id}`,
  );
}
export function accessAllowed(
  headers: Headers,
  method: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const host = headers.get("host") || "";
  if (env.APP_ACCESS === "hosted") {
    try {
      const url = new URL(env.APP_URL || "");
      const localBrowserCheck = Boolean(
        env.JOBCOMPASS_BROWSER_CHECK_ID &&
        !env.VERCEL &&
        url.hostname === "127.0.0.1" &&
        url.protocol === "http:",
      );
      if (
        (url.protocol !== "https:" && !localBrowserCheck) ||
        url.host !== host ||
        (!env.OWNER_EMAIL && env.PUBLIC_SIGNUP !== "true") ||
        !env.BETTER_AUTH_SECRET ||
        env.BETTER_AUTH_SECRET.length < 32
      )
        return false;
    } catch {
      return false;
    }
  } else {
    if (env.APP_ACCESS !== "local" || env.VERCEL || env.CF_PAGES) return false;
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  }
  const forwarded = headers.get("x-forwarded-host");
  if (forwarded && forwarded !== host) return false;
  if (headers.get("sec-fetch-site") === "cross-site") {
    // Links from other sites may open pages; cross-site fetches, embedded
    // documents and state-changing requests must still be rejected.
    const documentNavigation =
      ["GET", "HEAD"].includes(method) &&
      headers.get("sec-fetch-mode") === "navigate" &&
      headers.get("sec-fetch-dest") === "document";
    if (!documentNavigation) return false;
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const origin = headers.get("origin");
    if (
      !origin ||
      (env.APP_ACCESS === "hosted"
        ? origin !== env.APP_URL
        : !["http://" + host, "https://" + host].includes(origin))
    )
      return false;
  }
  return true;
}
