/* global document, window, innerWidth, chrome, crypto */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { cvLayoutFixture } from "./cv-layout-fixture.mjs";
async function snapshot(page, name) {
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
    return (
      '<!doctype html><html lang="en" data-theme="' +
      (document.documentElement.dataset.theme || "light") +
      '"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>' +
      css +
      "</style></head>" +
      document.body.outerHTML +
      "</html>"
    );
  });
  await writeFile("test-results/design-" + name + ".html", html);
}
const origin = "http://127.0.0.1:3000",
  target = "https://job-boards.greenhouse.io/jobcompass-fixture/jobs/123",
  catalogId = "e".repeat(64);
const source = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(source.hostname))
  throw new Error("Local fixture DB only");
const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";
const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
if (
  !(
    await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname='jobcompass_filling_test'`
  ).length
)
  await admin.$executeRawUnsafe("CREATE DATABASE jobcompass_filling_test");
await admin.$disconnect();
source.pathname = "/jobcompass_filling_test";
const env = {
  ...process.env,
  DATABASE_URL: source.toString(),
  APP_ACCESS: "hosted",
  APP_URL: origin,
  PUBLIC_SIGNUP: "true",
  OWNER_EMAIL: "fill-owner@release.example",
  MATCH_MODE: "owner",
  FILL_MODE: "owner",
  AI_MODE: "off",
  JSEARCH_API_KEY: "",
  BETTER_AUTH_SECRET: "filling-fixture-only-secret-over-32-characters",
  JOBCOMPASS_BROWSER_CHECK_ID: randomUUID(),
};
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env, stdio: "pipe" },
);
const db = new PrismaClient({ datasourceUrl: source.toString() });
await db.$executeRawUnsafe(
  'TRUNCATE "ApplicationFillSession","CandidateProfile","ApplicationAnswer","ApplicationQuestion","MatchDecision","CatalogBoard","ResumeAsset","User","RateLimit","Profile","Settings","Job" CASCADE',
);
await db.catalogBoard.create({
  data: {
    id: "fill-browser-fixture",
    name: "Fictional Labs",
    token: "jobcompass-fixture",
    platform: "greenhouse",
    lastSuccessAt: new Date(),
    initialIndexedAt: new Date(),
  },
});
await db.catalogJob.create({
  data: {
    id: catalogId,
    boardId: "fill-browser-fixture",
    providerId: "fill-browser:123",
    title: "Kotlin Engineer",
    employer: "Fictional Labs",
    sourceUrl: target,
    applyUrl: target,
    hash: "fixture",
    searchText: "kotlin engineer",
  },
});
await mkdir("test-results", { recursive: true });
const log = createWriteStream("test-results/filling-browser-server.log");
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
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
server.stdout.pipe(log);
server.stderr.pipe(log);
let context,
  employer,
  page,
  worker,
  postAttempts = 0;
const checks = [],
  errors = [];
const check = (s) => {
  checks.push(s);
  console.log("PASS: " + s);
};
const fixture = `<!doctype html><html><head><title>Fictional Greenhouse application</title><style>body{font:16px/1.5 Arial;margin:30px;max-width:760px}label{display:block;margin:16px 0}input,select,textarea{display:block;padding:9px;width:300px}input[type=checkbox],input[type=radio]{display:inline;width:auto}fieldset{margin:16px 0}button{padding:12px}h1{font-size:26px}</style></head><body><h1>Kotlin Engineer - Fictional Labs</h1><p>Controlled local browser fixture. No employer application.</p><form enctype="multipart/form-data" id="application" action="/never-submit" method="post"><label>First name *<input id="first_name" aria-required="true"></label><label>Last name *<input id="last_name" aria-required="true"></label><label>Email *<input id="email" type="text" aria-required="true" value="kept-by-user@example.test"></label><label>Phone number<input name="phone" type="tel"></label><label>Attach<input id="resume" name="resume" type="file" accept=".pdf,.docx" required style="display:none"></label><label>Are you authorized to work in Singapore? *<input name="authorization" role="combobox" aria-controls="auth-options" readonly aria-required="true"><div role="listbox" id="auth-options" hidden><div role="option" data-value="y">Yes</div><div role="option" data-value="n">No</div></div></label><fieldset><legend>Will you require sponsorship? *</legend><label><input type="radio" name="sponsorship" value="y" required>Yes</label><label><input type="radio" name="sponsorship" value="n" required>No</label></fieldset><label>What is your favourite project? *<textarea name="project" required></textarea></label><label><input name="consent" type="checkbox" aria-required="true">I agree to the employer privacy notice</label><button type="submit">Submit application</button></form><script>const auth=document.querySelector('[name=authorization]'),options=document.getElementById('auth-options');auth.addEventListener('keydown',e=>{if(e.key==='ArrowDown'&&e.isTrusted)options.hidden=false;if(e.key==='Escape')options.hidden=true;});for(const o of options.children)o.addEventListener('click',()=>{auth.value=o.textContent;auth.dataset.selectedValue=o.textContent;options.hidden=true;});document.querySelector('[name=phone]').addEventListener('input',e=>{setTimeout(()=>e.target.value='',20)});window.submissionAttempts=0;document.querySelector('form').addEventListener('submit',e=>{window.submissionAttempts++;e.preventDefault();});</script></body></html>`;
try {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(origin + "/sign-in")).ok) break;
    } catch {
      /* Waiting for the isolated fixture server. */
    }
    if (i === 89) throw new Error("Fixture server did not start");
    await delay(1000);
  }
  const profileDir = await mkdtemp(
    path.join(tmpdir(), "jobcompass-fill-browser-"),
  );
  context = await chromium.launchPersistentContext(profileDir, {
    executablePath:
      process.env.CHROME_EXECUTABLE_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
    viewport: { width: 1440, height: 1000 },
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const loaded = await cdp.send("Extensions.loadUnpacked", {
    path: path.resolve("extension"),
  });
  assert.equal(loaded.id, "iljjpkhlfijljkfglkpnpmodadeohchi");
  worker =
    context
      .serviceWorkers()
      .find((w) => w.url().startsWith("chrome-extension://" + loaded.id)) ||
    (await context.waitForEvent("serviceworker"));
  await context.route("https://job-boards.greenhouse.io/**", async (route) => {
    if (route.request().method() !== "GET") {
      postAttempts++;
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: fixture,
    });
  });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/sign-in");
  const signup = await page.request.post(origin + "/api/auth/sign-up/email", {
    headers: { origin },
    data: {
      name: "Fill Owner",
      email: env.OWNER_EMAIL,
      password: "fixture-only-password-123-strong",
    },
  });
  assert.equal(signup.status(), 200);
  const user = (await signup.json()).user;
  await db.matchDecision.create({
    data: {
      workspaceId: user.id,
      catalogId,
      providerId: "fill-browser:123",
      applyUrl: target,
      state: "queued",
      snapshot: {
        title: "Kotlin Engineer",
        employer: "Fictional Labs",
        applyUrl: target,
      },
    },
  });
  const cv = await cvLayoutFixture();
  const uploaded = await page.request.post(
    origin + "/api/application-profile/import",
    {
      headers: { origin },
      multipart: {
        file: {
          name: "fictional-original.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          buffer: cv,
        },
      },
    },
  );
  assert.equal(uploaded.status(), 200);
  const asset = (await uploaded.json()).cvSource;
  const base = {
    contact: {
      name: "Alex Example",
      firstName: "Alex",
      lastName: "Example",
      email: "alex@release.example",
      phone: "+6561234567",
      location: "Singapore",
      linkedin: "",
      portfolio: "",
    },
    experience: [],
    education: [],
    projects: [],
    skills: [],
    eligibility: [
      {
        id: randomUUID(),
        country: "Singapore",
        status: "citizen",
        needsSponsorship: "no",
        details: "",
        expiresOn: "",
      },
    ],
    preferences: {
      salaryAnswer: "",
      salaryCountry: "",
      availability: "",
      noticePeriod: "",
      relocation: "unknown",
    },
    nothingToDeclare: [],
    cvSource: asset,
  };
  assert.equal(
    (
      await page.request.post(origin + "/api/application-profile/profile", {
        headers: { origin },
        data: {
          values: base,
          expectedRevision: 0,
          confirmSections: ["contact", "eligibility"],
        },
      })
    ).status(),
    200,
  );
  await page.goto(origin + "/apply/" + catalogId);
  await page
    .getByLabel("Country where this job is based", { exact: true })
    .fill("Singapore");
  await page
    .getByRole("checkbox", { name: /Use my confirmed profile/ })
    .check();
  await page.screenshot({
    path: "test-results/filling-setup-desktop.png",
    fullPage: true,
  });
  await snapshot(page, "filling-setup-desktop");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({
    path: "test-results/filling-setup-tablet.png",
    fullPage: true,
  });
  await snapshot(page, "filling-setup-tablet");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/filling-setup-phone.png",
    fullPage: true,
  });
  await snapshot(page, "filling-setup-phone");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Use dark theme", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/filling-setup-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Use light theme", exact: true })
    .click();
  const newPage = context.waitForEvent("page");
  await page
    .getByRole("button", { name: "Connect and fill", exact: true })
    .click();
  employer = await newPage;
  employer.on("pageerror", (e) => errors.push(e.message));
  await employer.waitForURL(target);
  await employer.waitForFunction(
    () => document.querySelector("#first_name")?.value === "Alex",
    null,
    { timeout: 30000 },
  );
  for (let i = 0; i < 60; i++) {
    const row = await db.applicationFillSession.findFirst({
      where: { workspaceId: user.id },
      orderBy: { createdAt: "desc" },
    });
    if (row?.state === "needs_input") break;
    if (i === 59) throw new Error("No companion report");
    await delay(500);
  }
  assert.equal(await employer.locator("#last_name").inputValue(), "Example");
  assert.equal(
    await employer.locator("#email").inputValue(),
    "kept-by-user@example.test",
  );
  assert.equal(
    await employer.locator("[name=authorization]").inputValue(),
    "Yes",
  );
  assert.ok(await employer.locator("[name=sponsorship][value=n]").isChecked());
  assert.equal(await employer.locator("[name=project]").inputValue(), "");
  assert.equal(await employer.locator("[name=consent]").isChecked(), false);
  const uploadedHash = await employer
    .locator("#resume")
    .evaluate(async (el) => {
      const b = await el.files[0].arrayBuffer();
      return [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
    });
  assert.equal(uploadedHash, createHash("sha256").update(cv).digest("hex"));
  check(
    "Real unpacked Chrome extension connects from the queue, preserves existing values, fills native text/select/radio controls and uploads the exact selected CV",
  );
  let session = await db.applicationFillSession.findFirstOrThrow({
    where: { workspaceId: user.id },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(
    session.report.results.some(
      (r) => r.status === "failed" && r.reason.includes("Phone"),
    ),
  );
  assert.ok(session.report.requiredMissing >= 2);
  assert.equal(
    await db.applicationQuestion.count({
      where: {
        workspaceId: user.id,
        question: "What is your favourite project?",
      },
    }),
    1,
  );
  check(
    "Post-fill verification catches a value cleared by the page; missing questions enter the private inbox and consent stays manual",
  );
  await page.goto(origin + "/application-profile?tab=inbox&job=" + catalogId);
  const row = page.locator(".answer-row").filter({
    has: page.getByRole("heading", {
      name: "What is your favourite project?",
      exact: true,
    }),
  });
  await row
    .getByRole("button", { name: "Answer question", exact: true })
    .click();
  await page
    .getByLabel("Your confirmed answer", { exact: true })
    .fill("I built a Kotlin scheduling service.");
  await page
    .getByRole("checkbox", { name: /I confirm this answer, its context/ })
    .check();
  await page
    .getByRole("button", { name: "Save confirmed answer", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Confirmed answer saved" })
    .waitFor();
  await employer.locator("[name=consent]").check();
  const appTab = await worker.evaluate(async (target) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url === target).id;
  }, target);
  await worker.evaluate(
    async (tabId) =>
      chrome.tabs.sendMessage(tabId, { action: "jc-start-fill" }),
    appTab,
  );
  await employer.waitForFunction(
    () =>
      document.querySelector("[name=project]").value ===
      "I built a Kotlin scheduling service.",
    null,
    { timeout: 30000 },
  );
  for (let i = 0; i < 60; i++) {
    session = await db.applicationFillSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    if (session.state === "filled") break;
    if (i === 59) throw new Error("Recheck did not complete");
    await delay(500);
  }
  assert.equal(session.report.requiredMissing, 0);
  assert.equal(session.report.submission, "not_submitted");
  assert.equal(await employer.evaluate(() => window.submissionAttempts), 0);
  assert.equal(postAttempts, 0);
  assert.equal(await db.application.count(), 0);
  check(
    "Answering once in the real inbox enables recheck to fill the previously missing answer without submission or AI calls",
  );
  await employer.screenshot({
    path: "test-results/filling-employer-report.png",
    fullPage: true,
  });
  await page.goto(origin + "/apply/" + catalogId);
  await page
    .getByText("Form checked — review the employer tab", { exact: true })
    .waitFor();
  await page.screenshot({
    path: "test-results/filling-progress-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Revoke connection", exact: true })
    .click();
  await page.getByText("Connection revoked", { exact: true }).waitFor();
  check(
    "Queue progress shows the real browser report and the connection can be revoked",
  );
  const other = await context.newPage();
  await other.request.post(origin + "/api/auth/sign-out", {
    headers: { origin },
    data: {},
  });
  const second = await other.request.post(origin + "/api/auth/sign-up/email", {
    headers: { origin },
    data: {
      name: "Other User",
      email: "fill-other@release.example",
      password: "fixture-only-other-password-strong",
    },
  });
  assert.equal(second.status(), 200);
  assert.equal(
    (
      await other.request.get(
        origin + "/api/application-fill/setup?job=" + catalogId,
      )
    ).status(),
    403,
  );
  assert.equal(errors.length, 0);
  check(
    "A second real account cannot access the owner-only filling API; browser errors and employer submissions remain zero",
  );
  await writeFile(
    "test-results/filling-browser.json",
    JSON.stringify(
      {
        checks,
        errors,
        fixtureOnly: true,
        realExtension: true,
        employerSubmissions: postAttempts,
        liveAiCalls: 0,
        viewports: [1440, 768, 390],
      },
      null,
      2,
    ),
  );
} catch (e) {
  if (employer)
    await employer
      .screenshot({
        path: "test-results/filling-employer-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  if (worker)
    console.log(
      JSON.stringify(
        await worker
          .evaluate(async () =>
            Object.values(await chrome.storage.session.get(null)).map((s) => ({
              error: s.error,
              id: s.id,
            })),
          )
          .catch(() => []),
      ),
    );
  console.log(
    JSON.stringify(
      await db.applicationFillSession.findMany({
        select: { state: true, scanHash: true, report: true },
      }),
    ),
  );
  if (page)
    await page
      .screenshot({
        path: "test-results/filling-browser-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  throw e;
} finally {
  if (context) await context.close();
  await db.$disconnect();
  execFileSync("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], {
    stdio: "ignore",
  });
  log.end();
}
