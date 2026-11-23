/* global document, window, innerWidth, getComputedStyle, localStorage, sessionStorage */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:net";
import {
  mkdirSync,
  createWriteStream,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { chromium } from "playwright-core";
import { setTimeout as delay } from "node:timers/promises";
import JSZip from "jszip";
import { cvLayoutFixture } from "./cv-layout-fixture.mjs";
const policyMessage =
  /content.security.policy|permissions.policy|\[report only\]/i;
const policyReports = [];
// Known, documented report-only exception (docs/security-headers.md): the
// DOCX preview bundle (docx-preview -> jszip -> stream/util browser shims) runs
// `Function("return function*() {}")` once when it loads. Everything else fails.
async function unexpectedPolicyReports() {
  const unexpected = [];
  for (const report of policyReports) {
    let known = false;
    if (/Evaluating a string as JavaScript/.test(report.text) && report.url) {
      const chunk = await fetch(report.url)
        .then((r) => r.text())
        .catch(() => "");
      known =
        chunk.includes("docxjs library predefined styles") &&
        chunk.includes('Function("return function*() {}")');
    }
    if (!known)
      unexpected.push(
        "policy report: " + report.text.slice(0, 300) + " @ " + report.url,
      );
  }
  return unexpected;
}
const origin = "http://127.0.0.1:3000";
// Fixture-only visual artifacts: inline the actual loaded CSS so design tools
// can inspect responsive layouts without a session or a running test server.
async function designSnapshot(page, name) {
  const html = await page.evaluate(() => {
    const css = [...document.styleSheets]
      .map((sheet) => {
        try {
          return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
        } catch {
          return "";
        }
      })
      .join("\n");
    const body = document.body.cloneNode(true);
    body
      .querySelectorAll("script,link,iframe,[hidden],[style*='display: none']")
      .forEach((node) => node.remove());
    body
      .querySelectorAll("input[type='password']")
      .forEach((node) => node.removeAttribute("value"));
    return `<!doctype html><html lang="en" data-theme="${document.documentElement.dataset.theme || "light"}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>${body.outerHTML}</html>`;
  });
  writeFileSync(`test-results/design-${name}.html`, html);
}
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
  AI_MODE: "owner",
  OWNER_EMAIL: "alex@release.example",
  JOBCOMPASS_TEST: "false",
  BETTER_AUTH_SECRET:
    "local-browser-release-secret-with-more-than-32-characters",
  JOBCOMPASS_BROWSER_CHECK_ID: randomUUID(),
  JSEARCH_API_KEY: "",
  PERSONAL_AI_ENCRYPTION_KEY: "22".repeat(32),
};
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env, stdio: "pipe" },
);
const db = new PrismaClient({ datasourceUrl: source.toString() });
await db.$executeRawUnsafe(
  'TRUNCATE TABLE "ApplicationFillSession", "RateLimit", "CandidateProfile", "ApplicationAnswer", "ApplicationQuestion", "MatchPreferences", "MatchDecision", "MatchAction", "AiConnection", "AiReview", "CatalogBoard", "CatalogJob", "CatalogSync", "User", "Job", "Profile", "Settings", "SearchRun", "ApiRequestLedger", "ProfileVersion", "ResumeAsset" CASCADE',
);
const catalogNow = new Date();
await db.catalogBoard.createMany({
  data: [
    {
      id: "fixture-tech",
      name: "Example Labs",
      platform: "ashby",
      token: "fixture-tech",
      jobCount: 1002,
      lastSuccessAt: catalogNow,
      initialIndexedAt: catalogNow,
    },
    {
      id: "fixture-design",
      name: "Example Creative",
      platform: "greenhouse",
      token: "fixture-design",
      jobCount: 1002,
      lastSuccessAt: catalogNow,
      initialIndexedAt: catalogNow,
    },
    {
      id: "fixture-health",
      name: "Example Health",
      platform: "lever",
      token: "fixture-health",
      jobCount: 1001,
      lastSuccessAt: catalogNow,
      initialIndexedAt: catalogNow,
    },
  ],
});
for (let start = 0; start < 3005; start += 200)
  await db.catalogJob.createMany({
    data: Array.from({ length: Math.min(200, 3005 - start) }, (_, offset) => {
      const i = start + offset;
      const employer = ["Example Labs", "Example Creative", "Example Health"][
        i % 3
      ];
      const title =
        i === 0
          ? "Kotlin Platform Engineer"
          : [
              "Product Designer",
              "Data Analyst",
              "Customer Success Manager",
              "Software Engineer",
              "People Operations Partner",
              "Marketing Manager",
            ][i % 6];
      const location = [
        "Singapore",
        "London, UK",
        "Berlin, Germany",
        "New York, USA",
      ][i % 4];
      return {
        id: createHash("sha256").update(`catalog-fixture-${i}`).digest("hex"),
        providerId: `catalog-fixture-${i}`,
        boardId: ["fixture-tech", "fixture-design", "fixture-health"][i % 3],
        title,
        employer,
        location,
        remote: i % 3 === 0,
        employmentType: "Full-time",
        description:
          i === 0
            ? "Build Kotlin services using PostgreSQL and Docker. Work with a thoughtful team to design reliable APIs and collaborate on product development. Kotlin experience is required. Accessibility experience is required. This is fictional browser-verification data."
            : "Work with a thoughtful team to build useful products. Collaborate with colleagues across design, engineering and customer teams to improve product experiences. This is fictional browser-verification data.",
        publishedAt: new Date(catalogNow.valueOf() - i * 3600_000),
        sourceUrl: `https://example.test/jobs/${i}`,
        applyUrl: `https://example.test/jobs/${i}`,
        hash: `fixture-${i}`,
        searchText: `${title} ${employer} ${location}`,
      };
    }),
  });
await db.catalogSync.create({ data: { id: "global", finishedAt: catalogNow } });
mkdirSync("test-results", { recursive: true });
const log = createWriteStream("test-results/release-server.log");
const server = spawn(
  process.execPath,
  [
    "--import",
    new URL("./ai-browser-fixture.mjs", import.meta.url).href,
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
  ],
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
  page.on("console", (m) => {
    if (policyMessage.test(m.text()))
      policyReports.push({
        text: m.text(),
        url: m.location().url || "",
      });
  });
  const policyHeaders = await page.request.get(origin + "/sign-in");
  assert.match(
    policyHeaders.headers()["content-security-policy-report-only"] || "",
    /default-src 'self'.*frame-ancestors 'none'/,
  );
  assert.match(
    policyHeaders.headers()["permissions-policy-report-only"] || "",
    /camera=\(\)/,
  );
  check("Report-only CSP and Permissions-Policy headers are served");
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
    .getByRole("heading", { name: "Find work that fits you", exact: true })
    .waitFor();
  await page.getByLabel("Target roles", { exact: true }).fill("Engineer");
  await page.getByLabel("Skills to emphasise", { exact: true }).fill("Kotlin");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("heading", { name: "Set your boundaries", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("These preferences reflect what I am looking for.", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save and discover", exact: true })
    .click();
  await page
    .locator("#swipe-job-title")
    .filter({ hasText: "Kotlin Platform Engineer" })
    .waitFor();
  await page.screenshot({
    path: "test-results/swipe-desktop.png",
    fullPage: false,
  });
  await designSnapshot(page, "swipe-desktop");
  const searchSummary = page.locator(".swipe-search-disclosure > summary");
  const decisionsBeforeSearch = await db.matchAction.count();
  await searchSummary.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await db.matchAction.count(), decisionsBeforeSearch);
  await page.keyboard.press("Enter");
  await page
    .getByLabel("Search within your matches", { exact: true })
    .waitFor();
  await searchSummary.click();
  const desktopDecision = await page
    .getByRole("button", { name: "Queue for review", exact: true })
    .boundingBox();
  assert.ok(
    desktopDecision && desktopDecision.y + desktopDecision.height <= 1001,
  );
  check(
    "Swipe actions stay in view and keyboard use of search cannot create a job decision",
  );
  await page.getByRole("button", { name: "View details", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByText("From the employer", { exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByLabel("Pass reason", { exact: true })
    .selectOption("Wrong role");
  const swipeCard = page.locator(".match-card");
  const swipeBox = await swipeCard.boundingBox();
  await page.mouse.move(swipeBox.x + swipeBox.width / 2, swipeBox.y + 75);
  await page.mouse.down();
  await page.mouse.move(
    swipeBox.x + swipeBox.width / 2 - 150,
    swipeBox.y + 75,
    { steps: 10 },
  );
  await page.mouse.up();
  await page
    .getByRole("status")
    .filter({ hasText: "Passed Kotlin Platform Engineer" })
    .waitFor();
  await page
    .getByRole("button", { name: "Undo last decision", exact: true })
    .first()
    .click();
  await page
    .locator("#swipe-job-title")
    .filter({ hasText: "Kotlin Platform Engineer" })
    .waitFor();
  check(
    "Matching onboarding, grounded card reasons, employer details, real drag-to-pass and undo work",
  );
  let failDecision = true;
  await page.route("**/api/matches/decision", async (route) => {
    if (failDecision) {
      failDecision = false;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "database_unavailable" }),
      });
    }
    return route.continue();
  });
  await page
    .getByRole("button", { name: "Queue for review", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Could not save your change" })
    .waitFor();
  assert.equal(
    await page.locator("#swipe-job-title").innerText(),
    "Kotlin Platform Engineer",
  );
  await page.locator("#swipe-job-title").click();
  await page.keyboard.press("ArrowRight");
  await page
    .getByRole("status")
    .filter({
      hasText:
        "Queued Kotlin Platform Engineer. Nothing was sent to the employer.",
    })
    .waitFor();
  await page.unroute("**/api/matches/decision");
  await page.goto(origin + "/queue");
  await page
    .locator(".match-queue-row")
    .filter({ hasText: "Kotlin Platform Engineer" })
    .waitFor();
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/matches/collection") && r.ok(),
    ),
    page.getByLabel("Priority", { exact: true }).selectOption("2"),
  ]);
  await page.reload();
  assert.equal(
    await page.getByLabel("Priority", { exact: true }).inputValue(),
    "2",
  );
  await page
    .getByRole("button", { name: "Save for later", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Your next move starts with a right swipe",
      exact: true,
    })
    .waitFor();
  await page.getByRole("link", { name: /^Saved for later/ }).click();
  await page
    .locator(".match-queue-row")
    .filter({ hasText: "Kotlin Platform Engineer" })
    .waitFor();
  await page
    .getByRole("button", { name: "Undo last decision", exact: true })
    .first()
    .click();
  await page.goto(origin + "/queue");
  await page
    .locator(".match-queue-row")
    .filter({ hasText: "Kotlin Platform Engineer" })
    .waitFor();
  await page.screenshot({
    path: "test-results/swipe-queue-desktop.png",
    fullPage: false,
  });
  await designSnapshot(page, "swipe-queue");
  const queueType = await page
    .locator(".match-queue-copy h2 button")
    .first()
    .evaluate((e) => ({
      fontSize: parseFloat(getComputedStyle(e).fontSize),
      parent: getComputedStyle(e.parentElement).fontSize,
      border: getComputedStyle(e).borderWidth,
    }));
  assert.ok(queueType.fontSize >= 18, JSON.stringify(queueType));
  check(
    "Failed swipe saves retain the card; retry, persistent queue priority, saved-for-later and undo remain real account data",
  );
  await page.goto(origin + "/discover");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.locator("#swipe-job-title").waitFor();
  await page.screenshot({
    path: "test-results/swipe-tablet.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const phoneDecision = await page
    .getByRole("button", { name: "Queue for review", exact: true })
    .boundingBox();
  assert.ok(
    phoneDecision &&
      phoneDecision.y >= 0 &&
      phoneDecision.y + phoneDecision.height <= 845,
  );
  assert.ok((await page.locator(".match-card").boundingBox()).y < 844 * 0.55);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/swipe-phone.png",
    fullPage: false,
  });
  await designSnapshot(page, "swipe-phone");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Use dark theme", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/swipe-dark.png",
    fullPage: false,
    animations: "disabled",
  });
  await designSnapshot(page, "swipe-dark");
  await page
    .getByRole("button", { name: "Use light theme", exact: true })
    .click();
  check(
    "Swipe keyboard shortcuts, readable queue titles and light/dark responsive layouts work",
  );
  await page.goto(origin + "/application-profile");
  await page.getByLabel("Full name", { exact: true }).fill("Alex Sample");
  await page
    .getByLabel("Application email", { exact: true })
    .fill("alex@release.example");
  await page
    .getByRole("checkbox", {
      name: "I checked this section and confirm the information is accurate.",
    })
    .check();
  await page
    .getByRole("button", { name: "Save and confirm", exact: true })
    .click();
  await page
    .locator(".candidate-section-header .candidate-confirmed")
    .waitFor();
  await page.reload();
  assert.equal(
    await page.getByLabel("Full name", { exact: true }).inputValue(),
    "Alex Sample",
  );
  check("Application onboarding persists confirmed facts after reload");
  await page.getByRole("link", { name: "Answer library", exact: true }).click();
  await page
    .getByLabel("Question to check", { exact: true })
    .fill("What is your full name?");
  await page
    .getByRole("button", { name: "Find confirmed answer", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Confirmed answer found", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".answer-result blockquote").innerText(),
    "Alex Sample",
  );
  await page
    .getByLabel("Question to check", { exact: true })
    .fill("Describe your favourite project");
  await page
    .getByRole("button", { name: "Find confirmed answer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Answer this question", exact: true })
    .click();
  await page
    .getByLabel("Your confirmed answer", { exact: true })
    .fill("I built a Kotlin scheduling service.");
  await page
    .getByLabel("Equivalent questions, one per line", { exact: true })
    .fill("Tell us about a project you built");
  await page
    .getByRole("checkbox", {
      name: "I confirm this answer, its context and the equivalence of any added questions.",
    })
    .check();
  await page
    .getByRole("button", { name: "Save confirmed answer", exact: true })
    .click();
  await page
    .locator(".answer-row")
    .filter({
      has: page.getByRole("heading", {
        name: "Describe your favourite project",
        exact: true,
      }),
    })
    .waitFor();
  await page
    .getByLabel("Question to check", { exact: true })
    .fill("Tell us about a project you built");
  await page
    .getByRole("button", { name: "Find confirmed answer", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Confirmed answer found", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".answer-result blockquote").innerText(),
    "I built a Kotlin scheduling service.",
  );
  check(
    "Answer inbox saves an explicitly confirmed answer and reuses only confirmed equivalent wording",
  );
  await page
    .getByRole("link", { name: "Your information", exact: true })
    .click();
  await page.getByLabel("Full name", { exact: true }).fill("Alex Revised");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Draft saved" }).waitFor();
  await page.getByRole("link", { name: "Answer library", exact: true }).click();
  await page.getByLabel("Question to check", { exact: true }).fill("Full name");
  await page
    .getByRole("button", { name: "Find confirmed answer", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Answer needed", exact: true })
    .waitFor();
  check(
    "Editing a confirmed profile invalidates reuse until the user confirms it again",
  );
  await page
    .getByRole("link", { name: "Your information", exact: true })
    .click();
  await page.getByLabel("Full name", { exact: true }).waitFor();
  await page.screenshot({
    path: "test-results/application-profile-desktop.png",
    fullPage: true,
  });
  await designSnapshot(page, "application-profile-desktop");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({
    path: "test-results/application-profile-tablet.png",
    fullPage: true,
  });
  await designSnapshot(page, "application-profile-tablet");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/application-profile-phone.png",
    fullPage: true,
  });
  await designSnapshot(page, "application-profile-phone");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Use dark theme", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/application-profile-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Use light theme", exact: true })
    .click();
  check(
    "Application profile remains readable on desktop, tablet, phone and dark theme without overflow",
  );
  await page.goto(origin + "/discover?view=list");
  await page
    .getByRole("heading", { name: "Discover jobs", exact: true })
    .waitFor();
  check("Public account creation starts a personal workspace");
  await page
    .getByRole("heading", { name: "3,005 available jobs", exact: true })
    .waitFor();
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
    fullPage: false,
  });
  assert.ok(
    await page
      .locator(".catalog-card h3 button")
      .first()
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize) >= 16),
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForURL(
    (url) =>
      url.pathname === "/discover" && url.searchParams.get("page") === "2",
  );
  await page.getByText("Page 2 of 101", { exact: true }).waitFor();
  check("Shared catalogue paginates more than 3,000 jobs in the database");
  await page.locator(".catalog-filter-disclosure > summary").click();
  for (const platform of ["workable", "recruitee", "lever-eu"]) {
    await page
      .getByRole("combobox", { name: "Job source", exact: true })
      .selectOption(platform);
    await page.waitForURL(
      (url) => url.searchParams.get("platform") === platform,
    );
    await page
      .getByRole("heading", { name: "0 matching jobs", exact: true })
      .waitFor();
  }
  await page
    .getByRole("combobox", { name: "Job source", exact: true })
    .selectOption("");
  await page.waitForURL((url) => !url.searchParams.has("platform"));
  await page
    .getByRole("heading", { name: "3,005 available jobs", exact: true })
    .waitFor();
  await page.locator(".catalog-filter-disclosure > summary").click();
  check(
    "Additional ATS source filters are selectable and never silently return unrelated source jobs",
  );
  await page
    .getByLabel("What are you looking for?", { exact: true })
    .fill("Kotlin");
  await page.getByRole("button", { name: "Search jobs", exact: true }).click();
  await page
    .getByRole("heading", { name: "1 matching jobs", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Kotlin Platform Engineer", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save job", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Saved", exact: true })
    .waitFor();
  const copied = await db.jobSource.findFirstOrThrow({
    where: { workspaceId: user.id, providerId: "catalog-fixture-0" },
  });
  assert.ok(copied.jobId);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  check(
    "Catalogue search, keyboard-accessible detail and account-private save work end-to-end",
  );
  await page.goto(origin + "/discover?view=list");
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
  await page
    .getByText("Looking for a specific company? Import another board", {
      exact: true,
    })
    .click();
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
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page.getByRole("link", { name: "Job library", exact: true }).click();
  await page
    .getByRole("button", { name: /Product Designer/ })
    .first()
    .waitFor();
  await page.screenshot({
    path: "test-results/release-jobs-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel("What are you looking for?", { exact: true })
    .fill("Product Designer");
  await page.getByRole("button", { name: "Search jobs", exact: true }).click();
  await page.waitForURL(/q=Product\+Designer/);
  await page.getByRole("button", { name: "Quick Browse", exact: true }).click();
  await page
    .getByRole("heading", { name: "Product Designer", exact: true })
    .waitFor();
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await page.getByRole("link", { name: "Shortlist", exact: true }).click();
  await page
    .getByRole("button", { name: /Product Designer/ })
    .first()
    .waitFor();
  check("Imported jobs can be saved and found in the private shortlist");
  await page
    .getByLabel("What are you looking for?", { exact: true })
    .fill("Product Designer");
  await page.getByRole("button", { name: "Search jobs", exact: true }).click();
  await page.waitForURL(/q=Product\+Designer/);
  await page.getByRole("button", { name: "Quick Browse", exact: true }).click();
  await page
    .getByRole("heading", { name: "Product Designer", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Prepare application", exact: true })
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
  let profileLoads = 0;
  await page.route("**/api/profile", async (route) => {
    if (route.request().method() === "GET" && profileLoads++ === 0)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "temporary_failure" }),
      });
    return route.continue();
  });
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry loading profile", exact: true })
    .click();
  await page.getByLabel("Target roles", { exact: false }).waitFor();
  assert.ok(profileLoads >= 2);
  await page.unroute("**/api/profile");
  check(
    "A failed profile load offers Retry and recovers without reloading the page",
  );
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
  second.on("console", (m) => {
    if (policyMessage.test(m.text()))
      policyReports.push({
        text: m.text(),
        url: m.location().url || "",
      });
  });
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
  assert.equal(
    (
      await second.request.get(origin + "/api/application-profile/profile")
    ).status(),
    403,
  );
  assert.equal(
    await second
      .getByRole("link", { name: "Application profile", exact: true })
      .count(),
    0,
  );
  check(
    "Application profile and answer memory are restricted to the owner preview",
  );
  const otherQueue = await second.request.get(
    origin + "/api/matches/collection",
  );
  assert.equal(otherQueue.status(), 403);
  const otherPreferences = await second.request.get(
    origin + "/api/matches/settings",
  );
  assert.equal(otherPreferences.status(), 403);
  check(
    "A second signed-in account cannot see matching preferences or the first account's queue",
  );
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
    404,
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
  check("Legacy shared-key AI and paid discovery remain disabled server-side");
  assert.equal(
    await second.getByRole("link", { name: "AI studio", exact: true }).count(),
    0,
  );
  assert.equal(
    (await second.request.get(origin + "/api/ai").then((r) => r.json()))
      .enabled,
    false,
  );
  assert.equal(
    (
      await second.request.post(origin + "/api/ai/reviews", {
        headers: { origin },
        data: {},
      })
    ).status(),
    403,
  );
  check("Owner AI preview is hidden and refused for the second account");
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page.getByRole("link", { name: "AI studio", exact: true }).click();
  await page.getByRole("heading", { name: "AI studio", exact: true }).waitFor();
  let providerRequests = 0;
  assert.equal(await page.locator(".ai-provider").getAttribute("open"), null);
  assert.equal(
    await page
      .locator("#ai-studio:visible")
      .getByLabel("Your API key", { exact: true })
      .isVisible(),
    false,
  );
  await page.getByRole("button", { name: "Connect AI", exact: true }).click();
  page.on("request", (r) => {
    if (
      r.url().includes("/api/ai/models") ||
      (r.url().includes("/api/ai/reviews") && r.method() === "POST")
    )
      providerRequests++;
  });
  await page
    .locator("#ai-studio:visible")
    .getByLabel("Your API key", { exact: true })
    .fill("fixture-browser-provider-key-123456");
  assert.equal(providerRequests, 0);
  assert.equal(
    await page.evaluate(
      () =>
        Object.values(localStorage).some((v) =>
          v.includes("fixture-browser-provider-key"),
        ) ||
        Object.values(sessionStorage).some((v) =>
          v.includes("fixture-browser-provider-key"),
        ),
    ),
    false,
  );
  await page.getByRole("button", { name: "Load models", exact: true }).click();
  await page
    .locator(
      'select[aria-label="Available models"] option[value="fixture-model"]',
    )
    .waitFor({ state: "attached" });
  await page
    .locator("#ai-studio:visible")
    .getByLabel("Available models", { exact: true })
    .selectOption("fixture-model");
  assert.equal(
    await page
      .locator("#ai-studio:visible")
      .getByLabel("Model ID", { exact: true })
      .inputValue(),
    "fixture-model",
  );
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await page
    .getByText("Connection saved securely.", { exact: false })
    .waitFor();
  const savedConnection = await db.aiConnection.findUniqueOrThrow({
    where: { workspaceId: user.id },
  });
  assert.ok(
    !savedConnection.keyCiphertext.includes("fixture-browser-provider-key"),
  );
  assert.equal(
    await page
      .locator("#ai-studio:visible")
      .getByLabel("Your API key", { exact: true })
      .isVisible(),
    false,
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Search all jobs", exact: true })
    .click();
  await page
    .locator(
      `.studio-job-choice[data-job-id="${createHash("sha256").update("catalog-fixture-0").digest("hex")}"]`,
    )
    .click();
  const sourceBytes = await cvLayoutFixture();
  await page.getByText("Upload preferences", { exact: true }).click();
  await page
    .getByRole("checkbox", { name: /Use my next upload as my saved CV/ })
    .check();
  await page.locator('input[type="file"]').setInputFiles({
    name: "fixture-resume.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: sourceBytes,
  });
  await page.waitForFunction(() =>
    document.querySelector("textarea")?.value.includes("Built Kotlin"),
  );
  assert.equal(providerRequests, 1);
  await page.getByTitle("Original CV Word layout", { exact: true }).waitFor();
  await page
    .getByRole("group", { name: "Source CV views" })
    .getByRole("button", { name: "ATS readiness", exact: true })
    .click();
  await page.getByRole("region", { name: "ATS readiness report" }).waitFor();
  const sourceReport = page.getByRole("region", {
    name: "ATS readiness report",
  });
  await sourceReport
    .getByRole("button", { name: "Parsed CV", exact: true })
    .click();
  await sourceReport
    .locator(".ats-parser-preview")
    .getByText(/^DOCX/)
    .waitFor();
  assert.ok((await sourceReport.locator(".ats-lines li").count()) > 0);
  await page.screenshot({
    path: "test-results/ai-ats-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("group", { name: "Source CV views" })
    .getByRole("button", { name: "CV text", exact: true })
    .click();
  check(
    "Original DOCX upload preserves its private template, renders a sandboxed preview and runs document-level ATS checks without AI",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/ai-studio-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const cvBox = await page.locator("#ai-resume-text").boundingBox();
  assert.ok(cvBox && cvBox.y < 844, `CV editor begins at ${cvBox?.y}px`);
  const cvNext = await page.locator(".studio-next:visible").boundingBox();
  assert.ok(
    cvNext && cvNext.y >= cvBox.y + cvBox.height,
    "Continuation never covers the CV editor",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Continue to review", exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: "test-results/p1-cv-mobile.png",
    fullPage: true,
  });
  check(
    "Mobile CV editor starts in the first viewport and Continue still requires an explicit accuracy check",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByLabel(
      "I have checked this résumé text for missing content, reading order and accuracy.",
      { exact: true },
    )
    .check();
  await page
    .getByRole("button", { name: "Continue to review", exact: true })
    .click();
  await page
    .getByLabel(
      "I agree to send these inputs to the selected provider and use my API allowance for this request.",
      { exact: true },
    )
    .check();
  await page
    .getByRole("button", { name: "Run AI review", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Reviewing your application", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Reviewing…", exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({ path: "test-results/ai-waiting-desktop.png" });
  await page
    .getByText("Quotes were checked against the submitted text.", {
      exact: false,
    })
    .waitFor();
  assert.equal(providerRequests, 2);
  const review = await db.aiReview.findFirstOrThrow({
    where: { workspaceId: user.id },
  });
  assert.equal(review.state, "succeeded");
  assert.ok(!JSON.stringify(review).includes("fixture-browser-provider-key"));
  assert.equal(
    (
      await second.request.get(origin + `/api/ai/reviews/${review.id}`)
    ).status(),
    403,
  );
  await page
    .getByRole("heading", {
      name: "What to improve before applying",
      exact: true,
    })
    .waitFor();
  assert.ok(
    (await page.locator(".ai-action-list li").first().innerText()).includes(
      "Accessibility",
    ),
  );
  assert.equal(
    await page
      .locator(".ai-summary-grid strong")
      .allTextContents()
      .then(JSON.stringify),
    JSON.stringify(["1", "0", "2"]),
  );
  await page.locator(".ai-report").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/ai-review-desktop.png",
    fullPage: true,
  });
  const reviewDownloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download application review", exact: true })
    .click();
  await (
    await reviewDownloaded
  ).saveAs("test-results/ai-application-review.txt");
  assert.ok(
    readFileSync("test-results/ai-application-review.txt", "utf8").includes(
      "Accessibility experience is required.",
    ),
  );
  await page
    .getByRole("button", { name: "Requirements & evidence", exact: true })
    .click();
  await page
    .getByLabel("Show requirements", { exact: true })
    .selectOption("attention");
  assert.equal(await page.locator(".ai-requirements article").count(), 2);
  assert.ok(
    (await page.locator(".ai-requirements").innerText()).includes(
      "Accessibility",
    ),
  );
  check(
    "Review overview prioritizes gaps, filters evidence and exports an actionable plan without another AI call",
  );
  assert.ok(
    (await page.locator(".ai-validation-warning").innerText()).includes(
      "1 unverifiable CV excerpt was removed",
    ),
  );
  assert.ok(
    !(await page.locator(".ai-report").innerText()).includes(
      "500 fictional engineers",
    ),
  );
  assert.ok(
    !readFileSync("test-results/ai-application-review.txt", "utf8").includes(
      "500 fictional engineers",
    ),
  );
  check(
    "Unverified model quotes are omitted and flagged for manual review without discarding verified results or retrying inference",
  );
  await page
    .getByRole("button", { name: "Overview & action plan", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/ai-review-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Tailored evidence outline", exact: true })
    .click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download text outline", exact: true })
    .click();
  const file = await downloaded;
  await file.saveAs("test-results/ai-evidence-outline.txt");
  assert.ok(
    readFileSync("test-results/ai-evidence-outline.txt", "utf8").includes(
      "Built Kotlin",
    ),
  );
  await page
    .getByRole("navigation", { name: "Application steps" })
    .getByRole("button", { name: "4 Tailored CV", exact: true })
    .click();
  const cvWorkspace = page.locator("#ai-studio:visible .ai-tailored-cv");
  await cvWorkspace
    .getByRole("button", { name: "Generate tailored CV", exact: true })
    .waitFor();
  assert.equal(providerRequests, 2);
  assert.equal(
    await cvWorkspace
      .getByRole("button", { name: "Generate tailored CV", exact: true })
      .isDisabled(),
    true,
  );
  await cvWorkspace.getByRole("checkbox", { name: /I agree to send/ }).check();
  await cvWorkspace
    .getByRole("button", { name: "Generate tailored CV", exact: true })
    .click();
  await cvWorkspace
    .getByTitle("Tailored CV in original Word format", { exact: true })
    .waitFor({ timeout: 30000 });
  assert.equal(providerRequests, 3);
  assert.equal(
    await cvWorkspace
      .getByRole("button", {
        name: "Download original-format Word CV",
        exact: true,
      })
      .isDisabled(),
    true,
  );
  await cvWorkspace
    .getByRole("button", { name: "Compare changes", exact: true })
    .click();
  assert.ok(
    (await cvWorkspace.locator(".cv-change-list").innerText()).includes(
      "Developed Kotlin",
    ),
  );
  assert.ok(
    (await cvWorkspace.locator(".cv-change-list").innerText()).includes(
      "Built Kotlin",
    ),
  );
  await cvWorkspace
    .getByRole("button", { name: "Edit wording", exact: true })
    .click();
  const paragraph = cvWorkspace.getByLabel("CV paragraph P0005", {
    exact: true,
  });
  await paragraph.fill(
    (await paragraph.inputValue()) + " Reviewed manually for this opportunity.",
  );
  await cvWorkspace
    .getByRole("button", { name: "Save wording", exact: true })
    .click();
  await cvWorkspace.getByText(/Revision 2/).waitFor();
  await cvWorkspace
    .getByRole("button", { name: "ATS check", exact: true })
    .click();
  await cvWorkspace
    .getByRole("region", { name: "ATS readiness report" })
    .waitFor();
  await cvWorkspace
    .getByRole("checkbox", { name: /I have checked the wording/ })
    .check();
  const wordDownload = page.waitForEvent("download");
  await cvWorkspace
    .getByRole("button", {
      name: "Download original-format Word CV",
      exact: true,
    })
    .click();
  await (await wordDownload).saveAs("test-results/ai-tailored-cv.docx");
  await cvWorkspace.getByText(/Revision 3/).waitFor();
  const originalZip = await JSZip.loadAsync(sourceBytes),
    tailoredZip = await JSZip.loadAsync(
      readFileSync("test-results/ai-tailored-cv.docx"),
    );
  for (const name of Object.keys(originalZip.files).filter(
    (n) => !originalZip.files[n].dir && n !== "word/document.xml",
  ))
    assert.deepEqual(
      await tailoredZip.file(name).async("uint8array"),
      await originalZip.file(name).async("uint8array"),
      name,
    );
  const textDownload = page.waitForEvent("download");
  await cvWorkspace
    .getByRole("button", { name: "Download CV text", exact: true })
    .click();
  await (await textDownload).saveAs("test-results/ai-tailored-cv.txt");
  assert.ok(
    readFileSync("test-results/ai-tailored-cv.txt", "utf8").includes(
      "Reviewed manually for this opportunity.",
    ),
  );
  assert.equal(providerRequests, 3);
  await cvWorkspace
    .getByRole("button", { name: "Document preview", exact: true })
    .click();
  await cvWorkspace
    .frameLocator('iframe[title="Tailored CV in original Word format"]')
    .getByText(/Developed Kotlin services/)
    .waitFor();
  await page.screenshot({ path: "test-results/ai-tailored-cv-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "test-results/ai-tailored-cv-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  check(
    "Original-format CV generation retains source styles/margins/header/footer, supports paragraph edits, ATS checks and exact reviewed downloads without extra inference",
  );
  await page
    .getByRole("navigation", { name: "Application steps" })
    .getByRole("button", { name: "5 Apply", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Apply on employer website", exact: false })
    .waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Apply on employer website", exact: false })
      .getAttribute("href"),
    "https://example.test/jobs/0",
  );
  await page
    .getByRole("button", { name: "Save to Applications", exact: true })
    .click();
  await page
    .getByText("Your application is tracked", { exact: true })
    .waitFor();
  const studioTracked = await db.application.findFirstOrThrow({
    where: {
      workspaceId: user.id,
      job: { sources: { some: { providerId: "catalog-fixture-0" } } },
    },
  });
  assert.equal(studioTracked.status, "Preparing");
  assert.equal(studioTracked.appliedAt, null);
  await page
    .getByRole("button", { name: "I’ve submitted my application", exact: true })
    .click();
  await page.getByText("Applied", { exact: true }).waitFor();
  assert.equal(providerRequests, 3);
  await page.screenshot({
    path: "test-results/ai-apply-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/ai-apply-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page
    .getByRole("heading", { name: "Application recorded", exact: true })
    .waitFor();
  await page.getByText("Applied", { exact: true }).waitFor();
  check(
    "Studio steps survive refresh; employer handoff tracks preparation and only explicit submission confirmation records Applied without AI calls",
  );
  await page
    .getByRole("link", { name: "Open application & timeline", exact: false })
    .click();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page
    .getByRole("link", { name: "Open tailored CV & downloads", exact: false })
    .click();
  await page
    .locator("#ai-studio:visible")
    .getByTitle("Tailored CV in original Word format", { exact: true })
    .waitFor();
  await page
    .locator("#ai-studio:visible")
    .getByRole("button", { name: "Compare changes", exact: true })
    .click();
  assert.ok(
    (
      await page.locator("#ai-studio:visible .cv-change-list").innerText()
    ).includes("Reviewed manually for this opportunity."),
  );
  assert.equal(providerRequests, 3);
  check(
    "Application Documents returns to the matching saved tailored CV, retaining manual edits without another model call",
  );
  await page
    .getByRole("navigation", { name: "Application steps" })
    .getByRole("button", { name: "3 Review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Improve this CV", exact: true })
    .click();
  assert.ok(
    (
      await page
        .locator("#ai-studio:visible")
        .getByLabel("Résumé text to review", { exact: true })
        .inputValue()
    ).includes("Built Kotlin"),
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Continue to review", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(providerRequests, 3);
  check(
    "Improving a reviewed CV restores its original inputs and requires fresh consent before another paid request",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "AI settings", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "AI settings", exact: true }).click();
  assert.equal(
    await page
      .locator("#ai-studio:visible")
      .getByLabel("Your API key", { exact: true })
      .inputValue(),
    "",
  );
  assert.equal(
    await page
      .locator("#ai-studio:visible")
      .getByLabel("Model ID", { exact: true })
      .inputValue(),
    "fixture-model",
  );
  assert.ok(
    (
      await page
        .locator("#ai-studio:visible .studio-provider-heading")
        .innerText()
    ).includes("fixture-model"),
  );
  check(
    "Saved encrypted connection restores the provider and selected model after refresh without returning its key",
  );
  assert.equal(await db.aiReview.count({ where: { workspaceId: user.id } }), 1);
  check(
    "AI model list, DOCX extraction, grounded provider fixture, private history and text download work end-to-end",
  );
  check(
    "Plaintext keys remain out of browser storage, reports and database; saved credentials never trigger automatic generation",
  );
  await page.goBack();
  await page.waitForFunction(
    () => !document.querySelector("dialog.ai-provider[open]"),
  );
  await page.goForward();
  await page.getByRole("button", { name: "AI settings", exact: true }).click();
  await page.locator("#ai-studio:visible dialog.ai-provider[open]").waitFor();
  check(
    "Browser Back closes provider settings without leaving a modal over the next application step; Forward restores navigation",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press("Escape");
  await page
    .locator("#ai-studio:visible dialog.ai-provider")
    .waitFor({ state: "hidden" });
  check(
    "AI settings is a separate native dialog and closes with Escape while preserving the selected connection",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/ai-studio-mobile.png",
    fullPage: true,
  });
  await designSnapshot(page, "studio");
  await page.setViewportSize({ width: 768, height: 1024 });
  assert.ok(
    await page
      .locator("#ai-studio:visible .studio-queue")
      .evaluate((node) => node.getBoundingClientRect().width >= 180),
  );
  await page.screenshot({
    path: "test-results/ai-studio-tablet.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Use dark theme", exact: true })
    .click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await designSnapshot(page, "studio-dark");
  await page.screenshot({
    path: "test-results/ai-studio-dark-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Use light theme", exact: true })
    .click();
  check("AI studio remains usable without horizontal overflow on mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/discover?view=list");
  await page
    .getByRole("heading", { name: "Discover jobs", exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "3,005 available jobs", exact: true })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/release-discovery-mobile.png",
    fullPage: false,
  });
  await page.locator(".catalog-card h3 button").first().click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  check(
    "Mobile catalogue cards and native detail-dialog keyboard controls work",
  );
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page.getByRole("link", { name: "Job library", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await page.locator(".board-list article").first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  const firstJob = await page
    .locator(".board-list article")
    .first()
    .boundingBox();
  assert.ok(
    firstJob && firstJob.y < 650,
    `First job begins at ${firstJob?.y}px`,
  );
  const saveHit = await page
    .locator(".board-list .card-actions button")
    .first()
    .boundingBox();
  assert.ok(saveHit && saveHit.width >= 44 && saveHit.height >= 44);
  await page
    .getByLabel("What are you looking for?", { exact: true })
    .fill("Product Designer");
  await page.getByLabel("Where?", { exact: true }).fill("Singapore");
  await page.getByRole("button", { name: "Search jobs", exact: true }).click();
  await page.waitForURL(/location=Singapore/);
  await page.locator(".board-list article").first().waitFor();
  await page.getByText("Filters & sort", { exact: true }).click();
  await page.getByLabel("Job status", { exact: true }).selectOption("skipped");
  await page.waitForURL(/status=skipped/);
  await page.getByLabel("Job status", { exact: true }).selectOption("active");
  await page.waitForURL((url) => !url.searchParams.has("status"));
  await page.getByText("Filters & sort", { exact: true }).click();
  await page.screenshot({
    path: "test-results/p1-library-mobile.png",
    fullPage: false,
  });
  check(
    "Mobile library shows its first role sooner, uses named-location search and separates skipped status from layout with 44px save targets",
  );
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
  assert.ok(typography.size >= 24);
  check("Workspace headings use readable sans-serif typography");
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page.getByRole("link", { name: "AI studio", exact: true }).click();
  await page.getByRole("button", { name: "AI settings", exact: true }).click();
  await page
    .locator("#ai-studio:visible")
    .getByLabel("Your API key", { exact: true })
    .fill("fixture-browser-provider-key-123456");
  await page.keyboard.press("Escape");
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
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page.getByRole("link", { name: "AI studio", exact: true }).click();
  await page
    .getByRole("button", { name: "AI settings", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "AI settings", exact: true }).click();
  assert.equal(
    await page
      .locator("#ai-studio:visible")
      .getByLabel("Your API key", { exact: true })
      .inputValue(),
    "",
  );
  check(
    "Sign-in restores the saved model while plaintext API keys remain absent from the browser",
  );
  assert.equal(
    await page
      .locator("#ai-studio:visible")
      .getByLabel("Model ID", { exact: true })
      .inputValue(),
    "fixture-model",
  );
  await page.getByRole("button", { name: "Forget key", exact: true }).click();
  await page
    .getByText("Saved connection and the key in this tab were removed.", {
      exact: true,
    })
    .waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Connect AI", exact: true }).click();
  assert.equal(
    await page
      .locator("#ai-studio:visible")
      .getByLabel("Model ID", { exact: true })
      .inputValue(),
    "",
  );
  assert.equal(
    await db.aiConnection.count({ where: { workspaceId: user.id } }),
    0,
  );
  check(
    "Forget key removes the encrypted account connection and prevents it restoring after refresh",
  );
  await page.keyboard.press("Escape");
  await page.goto(origin + "/discover?view=list");
  await page.getByRole("button", { name: "For you", exact: true }).click();
  await page.locator(".catalog-match-details").first().waitFor();
  const personalized = await page.request.get(
    origin + "/api/catalog?forYou=true",
  );
  const personalizedData = await personalized.json();
  assert.equal(personalizedData.personalization.hasCv, true);
  assert.ok(
    personalizedData.personalization.skills.some((s) => s.term === "Kotlin"),
  );
  const unpersonalized = await second.request.get(
    origin + "/api/catalog?forYou=true",
  );
  assert.equal((await unpersonalized.json()).personalization.hasSignals, false);
  await page.screenshot({
    path: "test-results/discovery-for-you-mobile.png",
    fullPage: false,
  });
  check(
    "For-you discovery uses saved CV signals, explains job matches and isolates recommendations between accounts without AI requests",
  );
  errors.push(...(await unexpectedPolicyReports()));
  assert.deepEqual(errors, []);
  assert.equal(await db.apiRequestLedger.count(), 0);
  assert.equal(await db.aiGeneration.count(), 0);
  check("No browser errors, paid-provider units or live AI calls");
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
