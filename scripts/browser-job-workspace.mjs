/* global document, innerWidth */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { cvLayoutFixture } from "./cv-layout-fixture.mjs";
import { inspectDocx } from "../src/lib/docx-template.ts";
import { originalText } from "../src/lib/original-cv-contracts.ts";
import { resumeChecks } from "../src/lib/resume-checks.ts";
const policyMessage = /content.security.policy|permissions.policy|\[report only\]/i;
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
const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw Error("Local fixture database only");
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
if (
  !(
    await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname='jobcompass_workspace_browser_test'`
  ).length
)
  await admin.$executeRawUnsafe(
    "CREATE DATABASE jobcompass_workspace_browser_test",
  );
await admin.$disconnect();
url.pathname = "/jobcompass_workspace_browser_test";
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  APP_ACCESS: "hosted",
  APP_URL: origin,
  PUBLIC_SIGNUP: "true",
  OWNER_EMAIL: "workspace-owner@release.example",
  AI_MODE: "owner",
  MATCH_MODE: "owner",
  FILL_MODE: "owner",
  JSEARCH_API_KEY: "",
  PERSONAL_AI_ENCRYPTION_KEY: "22".repeat(32),
  BETTER_AUTH_SECRET: "workspace-fixture-auth-secret-over-32-characters",
  JOBCOMPASS_BROWSER_CHECK_ID: randomUUID(),
};
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env, stdio: "pipe" },
);
const db = new PrismaClient({ datasourceUrl: url.toString() });
await db.$executeRawUnsafe(
  'TRUNCATE "Profile","User","Job","CatalogBoard","ResumeAsset","CandidateProfile","MatchDecision","AiReview","AiGeneration","ProfileVersion","RateLimit" CASCADE',
);
await db.catalogBoard.create({
  data: {
    id: "workspace-fixture",
    name: "Fictional Labs",
    token: "workspace-fixture",
    platform: "greenhouse",
    lastSuccessAt: new Date(),
    initialIndexedAt: new Date(),
  },
});
const description =
  "Build Kotlin and Android applications for a product engineering team. Kotlin experience is required. Kubernetes experience is preferred. Collaborate with product and design on reliable software delivery.";
for (let i = 0; i < 35; i++)
  await db.catalogJob.create({
    data: {
      id: createHash("sha256")
        .update("workspace-fixture-" + i)
        .digest("hex"),
      boardId: "workspace-fixture",
      providerId: "workspace-fixture:" + i,
      title: "Kotlin Engineer " + i,
      employer: "Fictional Labs",
      country: "Singapore",
      location: "Singapore",
      description,
      applyUrl:
        "https://job-boards.greenhouse.io/workspace-fixture/jobs/" + (100 + i),
      sourceUrl:
        "https://job-boards.greenhouse.io/workspace-fixture/jobs/" + (100 + i),
      hash: "fixture",
      searchText: "kotlin engineer android kubernetes software",
      remote: true,
    },
  });
await mkdir("test-results", { recursive: true });
const log = createWriteStream("test-results/job-workspace-browser-server.log");
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3000",
  ],
  { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
const checks = [],
  errors = [];
const check = (name) => {
  checks.push(name);
  console.log(name);
};
async function snapshot(page, name) {
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
  const html = await page.evaluate(() => {
    const css = [...document.styleSheets]
      .map((s) => {
        try {
          return [...s.cssRules].map((r) => r.cssText).join("\n");
        } catch {
          return "";
        }
      })
      .join("\n");
    return `<!doctype html><html lang="en" data-theme="${document.documentElement.dataset.theme || "light"}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>${document.body.outerHTML}</html>`;
  });
  await writeFile(`test-results/design-${name}.html`, html);
}
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin + "/sign-in")).ok) break;
    } catch {
      /* local fixture boot */
    }
    if (i === 59) throw Error("Fixture server unavailable");
    await delay(1000);
  }
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_EXECUTABLE_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (policyMessage.test(message.text()))
      policyReports.push({
        text: message.text(),
        url: message.location().url || "",
      });
  });
  const signup = await context.request.post(
    origin + "/api/auth/sign-up/email",
    {
      headers: { origin },
      data: {
        name: "Workspace Owner",
        email: env.OWNER_EMAIL,
        password: "fixture-only-password-123-strong",
      },
    },
  );
  assert.equal(signup.status(), 200);
  const user = (await signup.json()).user;
  const bytes = await cvLayoutFixture();
  const imported = await context.request.post(
    origin + "/api/application-profile/import",
    {
      headers: { origin },
      multipart: {
        file: {
          name: "fictional-original.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          buffer: bytes,
        },
      },
    },
  );
  assert.equal(imported.status(), 200);
  const profile = await imported.json(),
    asset = profile.cvSource;
  const source = await db.resumeAsset.findUniqueOrThrow({
    where: { id: asset.assetId },
  });
  await db.profile.upsert({
    where: { workspaceId_id: { workspaceId: user.id, id: "owner" } },
    create: {
      workspaceId: user.id,
      id: "owner",
      cvText: source.text,
      skills: ["Kotlin"],
      titles: ["Kotlin Engineer"],
    },
    update: {
      cvText: source.text,
      skills: ["Kotlin"],
      titles: ["Kotlin Engineer"],
    },
  });
  const preferences = await context.request.post(
    origin + "/api/matches/preferences",
    {
      headers: { origin },
      data: {
        values: {
          titles: ["Kotlin Engineer"],
          skills: ["Kotlin"],
          reviewed: true,
        },
        expectedRevision: 0,
      },
    },
  );
  assert.equal(preferences.status(), 200);
  const connection = await context.request.put(origin + "/api/ai/connection", {
    headers: { origin },
    data: {
      provider: "openai",
      model: "fixture-model",
      apiKey: "fixture-provider-key-no-network",
    },
  });
  assert.equal(connection.status(), 200);
  await page.goto(origin + "/my-jobs");
  await page.getByRole("heading", { name: "My jobs", exact: true }).waitFor();
  await page.locator(".job-workspace-row").first().waitFor();
  assert.equal(await page.locator(".job-workspace-row").count(), 30);
  check("Matching jobs use the real paginated catalogue and preferences");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForURL(/page=2/);
  await page.waitForFunction(
    () => document.querySelectorAll(".job-workspace-row").length === 5,
  );
  check("Matching pagination reaches the next distinct page");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Saved for later.", { exact: true }).waitFor();
  await page
    .getByRole("link", { name: /^Saved/ })
    .first()
    .click();
  await page.locator(".job-workspace-row").first().waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".job-workspace-row").length === 1,
  );
  check("Saving a job persists it in the Saved stage");
  await page.goto(origin + "/my-jobs");
  await page.locator(".job-workspace-row").first().waitFor();
  for (const [name, width] of [
    ["workspace-desktop", 1440],
    ["workspace-tablet", 900],
    ["workspace-phone", 390],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await snapshot(page, name);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  check("Job list and selected opportunity fit desktop, tablet and phone");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await snapshot(page, "workspace-dark");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  const prepareHref = await page
    .getByRole("link", { name: "Prepare application" })
    .getAttribute("href");
  const catalogId = new URL(prepareHref, origin).searchParams.get("jobId");
  const catalog = await db.catalogJob.findUniqueOrThrow({
    where: { id: catalogId },
  });
  const inspection = await inspectDocx(bytes);
  const document = {
    format: "original-docx",
    sourceAssetId: source.id,
    sourceSha256: source.sha256,
    findings: inspection.findings,
    paragraphs: inspection.paragraphs.map((p) => ({
      ...p,
      original: p.text,
      text: p.text,
    })),
  };
  const review = await db.aiReview.create({
    data: {
      workspaceId: user.id,
      requestKey: randomUUID(),
      fingerprint: randomUUID(),
      provider: "openai",
      model: "fixture-model",
      state: "succeeded",
      jobSnapshot: {
        id: catalogId,
        source: "catalog",
        title: catalog.title,
        employer: catalog.employer,
        description,
      },
      resumeSnapshot: source.text,
      checks: {
        ...resumeChecks(source.text, description),
        sourceDocument: {
          id: source.id,
          name: source.name,
          sha256: source.sha256,
          findings: inspection.findings,
          passed: inspection.passed,
          total: inspection.total,
        },
      },
    },
  });
  await db.aiCvDraft.create({
    data: {
      workspaceId: user.id,
      reviewId: review.id,
      requestKey: randomUUID(),
      fingerprint: randomUUID(),
      provider: "openai",
      model: "fixture-model",
      state: "succeeded",
      document,
      content: originalText(document),
    },
  });
  await page.route("**/api/ai/reviews", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const payload = route.request().postDataJSON();
    assert.equal(payload.jobId, catalogId);
    assert.equal(payload.keywordEvidence.length, 1);
    assert.equal(payload.keywordEvidence[0].term, "Kubernetes");
    await route.fulfill({ json: review });
  });
  await page.getByRole("link", { name: "Prepare application" }).click();
  await page
    .getByRole("heading", { name: "Choose the CV for this application" })
    .waitFor();
  await page.locator(".preparation-ats > summary").click();
  await page.getByRole("button", { name: "Parsed CV", exact: true }).click();
  await page.locator(".ats-parser-preview").getByText(/^DOCX/).waitFor();
  await page.locator(".ats-fields").getByText("Alex Morgan", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Show source", exact: true }).first().click();
  await page.locator(".ats-lines li:focus").waitFor();
  check("Saved original CV exposes parsed fields and keyboard-focusable source evidence without a model call");
  await page
    .getByLabel("I’ve checked this CV and the information is accurate.")
    .check();
  await page.getByRole("button", { name: "Check missing keywords" }).click();
  await page
    .getByLabel("I have experience with Kubernetes", { exact: true })
    .check();
  await page
    .getByLabel("Confirmed experience with Kubernetes")
    .fill("I used Kubernetes for a personal deployment project.");
  await page.getByLabel(/^Send this CV and job description/).check();
  await page.getByRole("button", { name: "Analyze & prepare CV" }).click();
  await page
    .getByRole("button", { name: "Use this CV for application" })
    .waitFor();
  await page.getByRole("button", { name: "ATS check", exact: true }).click();
  await page.getByText("Exported file text verified", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Job requirements", exact: true }).click();
  await page.locator(".ats-requirements article").first().waitFor();
  await page.getByRole("button", { name: "Findings & fixes", exact: true }).click();
  await page.locator(".ats-detailed").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/ats-desktop.png", fullPage: false });
  await snapshot(page, "ats-report");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: "test-results/ats-phone.png", fullPage: false });
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.screenshot({ path: "test-results/ats-dark.png", fullPage: false });
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await page.setViewportSize({ width: 1440, height: 1000 });
  check("Tailored Word ATS view verifies the exact export, shows job requirements and renders in phone/dark layouts");
  check(
    "CV review explicitly carries selected keyword evidence and saved provider settings",
  );
  await page.getByLabel(/I have checked the wording, facts/).check();
  await page
    .getByRole("button", { name: "Use this CV for application" })
    .click();
  await page.waitForURL(/preparedCv=/);
  check(
    "Reviewed CV materializes through the real API and stays selected for this application",
  );
  const privateJob = await db.job.create({
    data: {
      workspaceId: user.id,
      title: catalog.title,
      employer: catalog.employer,
      description,
      relatedFingerprint: randomUUID(),
    },
  });
  await db.application.create({
    data: { workspaceId: user.id, jobId: privateJob.id, status: "Preparing" },
  });
  const facts = await db.profileVersion.create({
    data: { workspaceId: user.id, facts: [] },
  });
  let paidRequests = 0;
  await page.route("**/api/ai/materials", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    paidRequests++;
    const payload = route.request().postDataJSON();
    const output = {
      coverLetter: [
        {
          text: "My Kotlin application experience is relevant to this engineering role.",
          evidence: [],
        },
        {
          text: "I would welcome the opportunity to contribute to your product team.",
          evidence: [],
        },
      ],
      answers: payload.questions.map((question) => ({
        question,
        text: "I built Kotlin applications and contributed implementation and testing.",
        evidence: [],
      })),
    };
    const run = await db.aiGeneration.create({
      data: {
        workspaceId: user.id,
        jobId: privateJob.id,
        profileVersionId: facts.id,
        requestKey: payload.requestKey,
        fingerprint: randomUUID(),
        jobSnapshot: review.jobSnapshot,
        settings: {
          kind: "application-materials",
          reviewId: review.id,
          provider: "openai",
          model: "fixture-model",
        },
        estimatedInputTokens: 100,
        maxOutputTokens: 1000,
        state: "succeeded",
        analysis: output,
        drafts: {
          create: [
            {
              kind: "cover_letter",
              content: output.coverLetter.map((p) => p.text).join("\n\n"),
              citations: [],
            },
            {
              kind: "answers",
              content: "Fixture narrative answers",
              citations: [],
            },
          ],
        },
      },
    });
    await route.fulfill({ json: run });
  });
  await page
    .getByRole("heading", { name: "Cover letter & screening answers" })
    .waitFor();
  await page.getByLabel(/^Send this job, reviewed CV evidence/).check();
  await page
    .getByRole("button", { name: "Generate application drafts" })
    .click();
  await page.getByLabel("Letter text").waitFor();
  assert.equal(paidRequests, 1);
  await page
    .getByLabel("Letter text")
    .fill(
      "My reviewed Kotlin experience supports this application. Thank you for considering my application.",
    );
  await page.getByRole("button", { name: "Save letter", exact: true }).click();
  await page.getByText(/Cover letter saved/).waitFor();
  check(
    "Generated cover letter is editable and saves through the account-scoped API",
  );
  await page
    .getByRole("button", { name: "Confirm & remember for this job" })
    .first()
    .click();
  await page.getByText(/Confirmed answer saved/).waitFor();
  assert.equal(
    await db.applicationAnswer.count({
      where: { workspaceId: user.id, catalogId },
    }),
    1,
  );
  check("Narrative answers enter memory only after explicit confirmation");
  await snapshot(page, "preparation-desktop");
  await page.getByRole("button", { name: "Continue to application" }).click();
  await page.getByRole("button", { name: "Add to application queue" }).click();
  await page.getByLabel("CV to attach").waitFor();
  const selectedCv = new URL(page.url()).searchParams.get("preparedCv");
  assert.equal(await page.getByLabel("CV to attach").inputValue(), selectedCv);
  check(
    "Preparation hands the exact selected CV to the real queued application flow",
  );
  assert.equal(await db.application.count({ where: { status: "Applied" } }), 0);
  assert.equal(paidRequests, 1);
  check("Preparation never submits or starts an unrequested provider call");
  await page.setViewportSize({ width: 390, height: 844 });
  await snapshot(page, "preparation-phone");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  const anonymous = await browser.newContext();
  for (const path of [
    "/api/job-workspace",
    "/api/ai/preparation?source=catalog&jobId=" + catalogId,
    "/api/ai/materials?reviewId=" + review.id,
  ])
    assert.equal((await anonymous.request.get(origin + path)).status(), 401);
  await anonymous.close();
  check("New workspace and preparation APIs reject anonymous access");
  const visitor = await browser.newContext();
  const publicSignup = await visitor.request.post(
    origin + "/api/auth/sign-up/email",
    {
      headers: { origin },
      data: {
        name: "Workspace Visitor",
        email: "visitor@release.example",
        password: "fixture-only-visitor-password-123",
      },
    },
  );
  assert.equal(publicSignup.status(), 200);
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(origin + "/my-jobs");
  await visitorPage
    .getByRole("heading", { name: "Find your next opportunity" })
    .waitFor();
  await visitorPage.getByRole("link", { name: /^Applied/ }).click();
  await visitorPage
    .getByRole("heading", { name: "No jobs here yet" })
    .waitFor();
  assert.equal(await visitorPage.locator(".job-workspace-row").count(), 0);
  await visitor.close();
  check(
    "Public accounts get catalogue and private pipeline access",
  );
  errors.push(...(await unexpectedPolicyReports()));
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/job-workspace-browser.json",
    JSON.stringify({ passed: checks.length, checks }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length }));
} catch (error) {
  const failurePage = browser?.contexts()[0]?.pages()[0];
  if (failurePage) {
    await failurePage.screenshot({
      path: "test-results/workspace-failure.png",
      fullPage: true,
    });
    await writeFile(
      "test-results/workspace-failure.txt",
      await failurePage.locator("body").innerText(),
    );
  }
  throw error;
} finally {
  await browser?.close();
  if (process.platform === "win32")
    execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  else server.kill("SIGTERM");
  await db.$disconnect();
  log.end();
}
