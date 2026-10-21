/* global document, innerWidth, getComputedStyle, localStorage, sessionStorage */
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
  AI_MODE: "owner",
  OWNER_EMAIL: "alex@release.example",
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
  'TRUNCATE TABLE "AiReview", "CatalogBoard", "CatalogJob", "CatalogSync", "User", "Job", "Profile", "Settings", "SearchRun", "ApiRequestLedger", "ProfileVersion", "ResumeAsset" CASCADE',
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
            ? "Build Kotlin services using PostgreSQL and Docker. Work with a thoughtful team to design reliable APIs and collaborate on product development. Kotlin experience is required. This is fictional browser-verification data."
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
  await page.waitForURL("**/discover?page=2");
  await page.getByText("Page 2 of 101", { exact: true }).waitFor();
  check("Shared catalogue paginates more than 3,000 jobs in the database");
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
  await page.goto(origin + "/discover");
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
  await page.getByRole("link", { name: "AI studio", exact: true }).click();
  await page.getByRole("heading", { name: "AI studio", exact: true }).waitFor();
  let providerRequests = 0;
  page.on("request", (r) => {
    if (
      r.url().includes("/api/ai/models") ||
      (r.url().includes("/api/ai/reviews") && r.method() === "POST")
    )
      providerRequests++;
  });
  await page
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
    .locator('datalist option[value="fixture-model"]')
    .waitFor({ state: "attached" });
  await page.getByLabel("Model ID", { exact: true }).fill("fixture-model");
  await page
    .getByLabel("Job to review", { exact: true })
    .selectOption(
      createHash("sha256").update("catalog-fixture-0").digest("hex"),
    );
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  const resumeLines = [
    "Alex Morgan",
    "alex@release.example",
    "EXPERIENCE",
    "Built Kotlin services with PostgreSQL and Docker at Example Studio, 2021–2025.",
    "EDUCATION",
    "BSc Computer Science, Example University, 2020.",
    "SKILLS",
    "Kotlin, PostgreSQL, Docker",
  ];
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="urn:test">${resumeLines.map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("")}</w:document>`,
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "fixture-resume.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
  await page.waitForFunction(() =>
    document.querySelector("textarea")?.value.includes("Built Kotlin"),
  );
  assert.equal(providerRequests, 1);
  await page.screenshot({ path: "test-results/ai-studio-desktop.png" });
  await page
    .getByLabel(
      "I have checked this résumé text for missing content, reading order and accuracy.",
      { exact: true },
    )
    .check();
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
  await page.screenshot({ path: "test-results/ai-review-desktop.png" });
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
  await page.reload();
  await page.getByLabel("Your API key", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Your API key", { exact: true }).inputValue(),
    "",
  );
  assert.equal(await db.aiReview.count({ where: { workspaceId: user.id } }), 1);
  check(
    "AI model list, DOCX extraction, grounded provider fixture, private history and text download work end-to-end",
  );
  check(
    "Keys remain out of browser storage and database, clear on refresh, and do not trigger automatic generation",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "test-results/ai-studio-mobile.png" });
  check("AI studio remains usable without horizontal overflow on mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/discover");
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
  await page.getByRole("link", { name: "AI studio", exact: true }).click();
  await page
    .getByLabel("Your API key", { exact: true })
    .fill("fixture-browser-provider-key-123456");
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
  await page.getByRole("link", { name: "AI studio", exact: true }).click();
  assert.equal(
    await page.getByLabel("Your API key", { exact: true }).inputValue(),
    "",
  );
  check(
    "Signing out clears the in-memory provider key before the next account session",
  );
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
