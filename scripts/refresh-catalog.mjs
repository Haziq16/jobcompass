/* global AbortSignal */
// Runs without dependencies; the scheduled GitHub job uses the same request.
const target = process.env.CATALOG_REFRESH_URL;
const secret = process.env.CATALOG_REFRESH_SECRET;
if (!target || !secret || secret.length < 32)
  throw new Error("Catalogue scheduler configuration is missing");
const url = new URL(target);
if (
  url.protocol !== "https:" ||
  url.pathname !== "/api/catalog/refresh" ||
  url.search ||
  url.username ||
  url.password
)
  throw new Error("Invalid scheduler target");
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${secret}` },
  redirect: "error",
  signal: AbortSignal.timeout(180_000),
});
if (!response.ok)
  throw new Error(`Catalogue refresh returned HTTP ${response.status}`);
const result = await response.json();
console.log(
  JSON.stringify({
    status: result.status,
    checked: result.checked,
    succeeded: result.succeeded,
    failed: result.failed,
  }),
);
if (
  result.status === "completed" &&
  result.checked > 0 &&
  result.succeeded === 0
)
  throw new Error("No employer feed could be refreshed");
