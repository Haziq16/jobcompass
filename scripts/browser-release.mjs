/* global document, innerWidth, getComputedStyle */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import {
  mkdirSync,
  createWriteStream,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { chromium } from "playwright-core";
import { setTimeout as delay } from "node:timers/promises";
const origin = "http://127.0.0.1:3000";
const source = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(source.hostname))
  throw new Error("Local test database only");
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on("error", reject);
  probe.listen(3000, "127.0.0.1", () => probe.close(resolve));
});
const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";
const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
if (
  !(
    await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname='jobcompass_release_test'`
  ).length
)
  await admin.$executeRawUnsafe("CREATE DATABASE jobcompass_release_test");
await admin.$disconnect();
source.pathname = "/jobcompass_release_test";
const env = {
  ...process.env,
  DATABASE_URL: source.toString(),
  APP_ACCESS: "hosted",
  APP_URL: origin,
  PUBLIC_SIGNUP: "true",
  ENABLE_AI: "false",
  JOBCOMPASS_TEST: "false",
  BETTER_AUTH_SECRET:
    "local-browser-release-secret-with-more-than-32-characters",
  JOBCOMPASS_BROWSER_CHECK_ID: randomUUID(),
  JSEARCH_API_KEY: "",
  AI_GATEWAY_API_KEY: "",
};
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env, stdio: "pipe" },
);
const db = new PrismaClient({ datasourceUrl: source.toString() });
await db.$executeRawUnsafe(
  'TRUNCATE TABLE "User", "Job", "Profile", "Settings", "SearchRun", "ApiRequestLedger", "ProfileVersion", "ResumeAsset" CASCADE',
);
mkdirSync("test-results", { recursive: true });
const log = createWriteStream("test-results/release-server.log");
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1"],
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
let activePage;
const checks = [];
const errors = [];
let discoveryRequests = 0;
function check(name) {
  checks.push(name);
  console.log("PASS:", name);
}
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(origin + "/api/fixture-submission");
      if (
        r.ok &&
        (await r.json()).checkId === env.JOBCOMPASS_BROWSER_CHECK_ID
      ) {
        ready = true;
        break;
      }
    } catch {
      /* The isolated server may still be starting. */
    }
    await delay(400);
  }
  assert.ok(ready, "Isolated server identity");
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_EXECUTABLE_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const alice = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    bob = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await alice.newPage();
  activePage = page;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/api/direct-discovery")) discoveryRequests++;
  });
  await page.goto(origin + "/jobs");
  await page.waitForURL("**/sign-in");
  check("Anonymous workspace access redirects to sign-in");
  await page
    .getByRole("link", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Your name", { exact: true }).fill("Alex Morgan");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("alex@release.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill("fixture-password-strong-123");
  await page.screenshot({
    path: "test-results/release-signup-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("**/discover");
  await page
    .getByRole("heading", { name: "Discover jobs", exact: true })
    .waitFor();
  check("Public account creation starts a personal workspace");
  const user = await db.user.findUniqueOrThrow({
    where: { email: "alex@release.example" },
  });
  const job = await db.job.create({
    data: {
      workspaceId: user.id,
      title: "Product Designer",
      employer: "Example Studio",
      location: "Singapore",
      description:
        "Design clear product experiences and collaborate with engineers.",
      relatedFingerprint: "release-role",
      sources: {
        create: {
          providerId: "release:designer",
          publisher: "Controlled fixture",
          sourceUrl: "https://example.test/jobs/designer",
          applyLinks: [
            {
              url: "https://example.test/jobs/designer",
              publisher: "Example Studio",
              direct: true,
            },
          ],
        },
      },
    },
  });
  assert.equal(discoveryRequests, 0);
  await page.screenshot({
    path: "test-results/release-discovery-desktop.png",
    fullPage: true,
  });
  let direct = 0;
  await page.route("**/api/direct-discovery", async (route) => {
    direct++;
    assert.equal(route.request().postDataJSON().input.board, "greenhouse");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 1, cached: false }),
    });
  });
  await page.getByRole("button", { name: "Greenhouse ↗", exact: true }).click();
  assert.equal(direct, 0);
  await page.getByRole("button", { name: "Find jobs", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "1 matching jobs" })
    .waitFor();
  assert.equal(direct, 1);
  check(
    "Board selection is free of requests; discovery dispatch is explicit (mocked import)",
  );
  await page.getByRole("link", { name: "My jobs", exact: true }).click();
  await page
    .getByRole("button", { name: /Product Designer/ })
    .first()
    .waitFor();
  await page.screenshot({
    path: "test-results/release-jobs-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Quick Browse", exact: true }).click();
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await page.getByRole("link", { name: "Saved", exact: true }).click();
  await page
    .getByRole("button", { name: /Product Designer/ })
    .first()
    .waitFor();
  check("Imported jobs can be saved and found in the private shortlist");
  await page.getByRole("button", { name: "Quick Browse", exact: true }).click();
  await page
    .getByRole("button", { name: "Track application", exact: true })
    .click();
  await page.waitForURL("**/applications/*");
  await page
    .getByLabel("Your notes", { exact: true })
    .fill("Follow up with the design team next week.");
  await page.getByRole("button", { name: "Save tracker", exact: true }).click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await page
    .getByRole("heading", { name: "Your application timeline" })
    .waitFor();
  check("Application notes and timeline work without AI tools");
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await page
    .getByRole("heading", { name: "Your profile", exact: true })
    .waitFor();
  await page
    .getByLabel("Target roles", { exact: false })
    .fill("Product designer");
  await page
    .getByLabel("Your skills", { exact: false })
    .fill("Research, Figma");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Profile saved" }).waitFor();
  await page.reload();
  await page.getByLabel("Your skills", { exact: false }).waitFor();
  assert.equal(
    await page.getByLabel("Your skills", { exact: false }).inputValue(),
    "Research, Figma",
  );
  check("Profile preferences save and survive reload");
  const second = await bob.newPage();
  second.on("pageerror", (e) => errors.push(e.message));
  await second.goto(origin + "/sign-up");
  await second.getByLabel("Your name", { exact: true }).fill("Sam Rivera");
  await second
    .getByLabel("Email address", { exact: true })
    .fill("sam@release.example");
  await second
    .getByLabel("Password", { exact: true })
    .fill("fixture-password-strong-456");
  await second
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await second.waitForURL("**/discover");
  const other = await second.request.get(origin + "/api/jobs");
  assert.equal(other.status(), 200);
  assert.equal((await other.json()).total, 0);
  assert.equal(
    (await second.request.get(origin + `/api/jobs/${job.id}`)).status(),
    404,
  );
  assert.equal(
    (await second.request.get(origin + "/api/export")).status(),
    200,
  );
  check(
    "A second real browser account cannot list or open the first account’s jobs",
  );
  assert.equal(
    (await page.request.get(origin + "/api/workspace/generations")).status(),
    410,
  );
  assert.equal(
    (
      await page.request.post(origin + "/api/discovery/search", {
        headers: { origin },
        data: {},
      })
    ).status(),
    403,
  );
  check("AI and shared paid discovery are disabled server-side");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/discover");
  await page
    .getByRole("heading", { name: "Discover jobs", exact: true })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/release-discovery-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "My jobs", exact: true }).click();
  await page
    .getByRole("button", { name: /Product Designer/ })
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  check(
    "Mobile navigation, job dialog and Escape work without horizontal overflow",
  );
  const typography = await page.locator("h1").evaluate((e) => ({
    family: getComputedStyle(e).fontFamily,
    size: parseFloat(getComputedStyle(e).fontSize),
  }));
  assert.ok(!typography.family.includes("Georgia"));
  assert.ok(typography.size >= 28);
  check("Workspace headings use readable sans-serif typography");
  await page.getByRole("button", { name: /Sign out/ }).click();
  await page.waitForURL("**/sign-in");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("alex@release.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill("fixture-password-strong-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/discover");
  check("Sign-out and returning-account sign-in work");
  assert.deepEqual(errors, []);
  assert.equal(await db.apiRequestLedger.count(), 0);
  assert.equal(await db.aiGeneration.count(), 0);
  check("No browser errors, paid-provider units or AI calls");
  writeFileSync(
    "test-results/release-browser.json",
    JSON.stringify(
      {
        passed: checks,
        errors,
        appBuildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
        checkedAt: new Date().toISOString(),
        fixtureOnly: true,
        liveProviderCalls: 0,
        viewports: [
          { width: 1440, height: 1000 },
          { width: 390, height: 844 },
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (activePage) {
    await activePage
      .screenshot({ path: "test-results/release-failure.png", fullPage: true })
      .catch(() => {});
  }
  throw error;
} finally {
  if (browser) await browser.close();
  await db.$disconnect();
  execFileSync("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], {
    stdio: "ignore",
  });
  log.end();
}
