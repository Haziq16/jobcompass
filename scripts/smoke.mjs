import assert from "node:assert/strict";
import { get } from "node:http";
const base = "http://127.0.0.1:3000";
const homepage = await fetch(base);
assert.equal(homepage.status, 200);
assert.equal(homepage.headers.get("x-frame-options"), "DENY");
const html = await homepage.text();
assert.ok(html.includes("JobCompass"));
const asset = html.match(/<script[^>]+src="([^"]+)"/);
assert.ok(asset);
assert.equal(
  (await fetch(new URL(asset[1].replaceAll("&amp;", "&"), base))).status,
  200,
);
for (const route of ["jobs", "usage", "profile", "searches"]) {
  const response = await fetch(base + "/api/" + route);
  assert.equal(response.status, 200);
  assert.ok(await response.json());
}
// Node fetch can discard an overridden Host header, so use the HTTP client for this case.
const blockedHost = await new Promise((resolve, reject) =>
  get(
    base + "/api/jobs",
    { headers: { host: "public.example" } },
    (response) => {
      response.resume();
      resolve(response.statusCode);
    },
  ).on("error", reject),
);
assert.equal(blockedHost, 403);
const blockedWrite = await fetch(base + "/api/discovery/search", {
  method: "POST",
  headers: {
    origin: "https://untrusted.example",
    "Content-Type": "application/json",
  },
  body: "{}",
});
assert.equal(blockedWrite.status, 403);
console.log(
  "Production HTTP smoke passed: homepage, JS asset, stored-data routes, public-host rejection and cross-origin write rejection. No provider requests made.",
);
