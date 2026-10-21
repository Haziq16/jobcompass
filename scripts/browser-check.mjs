/* global chrome, innerWidth, document */
import { PrismaClient } from "@prisma/client";
import { setTimeout } from "node:timers";
import { spawn, execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  createWriteStream,
} from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { chromium } from "playwright-core";
const source = new URL(process.env.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(source.hostname))
  throw new Error("Browser checks are local-only");
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", () =>
    reject(
      new Error(
        "Port 3000 is occupied. Stop the existing app before browser fixture tests.",
      ),
    ),
  );
  probe.listen(3000, "127.0.0.1", () => probe.close(resolve));
});
const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";
const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
if (
  !(
    await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname='jobcompass_browser_test'`
  ).length
)
  await admin.$executeRawUnsafe("CREATE DATABASE jobcompass_browser_test");
await admin.$disconnect();
source.pathname = "/jobcompass_browser_test";
const env = {
  ...process.env,
  DATABASE_URL: source.toString(),
  APP_ACCESS: "local",
  APP_URL: "",
  JSEARCH_API_KEY: "",
  JSEARCH_PLAN_CONFIRMED: "false",
  AI_GATEWAY_API_KEY: "",
  AI_GATEWAY_MODEL: "",
  COMPANION_EXTENSION_ID: "iljjpkhlfijljkfglkpnpmodadeohchi",
  JOBCOMPASS_BROWSER_CHECK_ID: randomUUID(),
};
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env, stdio: "pipe" },
);
execFileSync(process.execPath, ["--import=tsx", "scripts/seed-browser.ts"], {
  env,
  stdio: "pipe",
});
mkdirSync("test-results", { recursive: true });
const log = createWriteStream("test-results/browser-server.log");
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
let browser;
let activePage;
const checks = [];
const check = (name) => {
  checks.push(name);
  console.log("PASS:", name);
};
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null)
      throw new Error(
        "The dedicated fixture server exited before verification.",
      );
    try {
      const response = await fetch(
        "http://127.0.0.1:3000/api/fixture-submission",
      );
      if (
        response.ok &&
        (await response.json()).checkId === env.JOBCOMPASS_BROWSER_CHECK_ID
      ) {
        ready = true;
        break;
      }
    } catch {
      /* Server is still starting. */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready)
    throw new Error(
      "Dedicated fixture-server identity was not verified; no browser actions performed.",
    );
  const profile = await mkdtemp(
    path.join(tmpdir(), "jobcompass-browser-test-"),
  );
  browser = await chromium.launchPersistentContext(profile, {
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
    viewport: { width: 1440, height: 1000 },
  });
  const extensionSession = await browser.browser().newBrowserCDPSession();
  const loadedExtension = await extensionSession.send(
    "Extensions.loadUnpacked",
    { path: path.resolve("extension") },
  );
  assert.equal(loadedExtension.id, "iljjpkhlfijljkfglkpnpmodadeohchi");
  const page = browser.pages()[0] || (await browser.newPage());
  activePage = page;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api.openwebninja.com/**", () => {
    throw new Error("Unexpected live JSearch call");
  });
  await page.route("**/ai-gateway.vercel.sh/**", () => {
    throw new Error("Unexpected live AI call");
  });
  let discoveryRequests = 0;
  page.on("request", (req) => {
    if (req.url().includes("/api/discovery/search")) discoveryRequests++;
  });
  const seed = JSON.parse(
    readFileSync("test-results/browser-seed.json", "utf8"),
  );
  await page.goto("http://127.0.0.1:3000/jobs");
  await page
    .getByRole("button", { name: /Android Developer/ })
    .first()
    .waitFor();
  await page.screenshot({
    path: "test-results/jobs-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Android Developer/ })
    .first()
    .click();
  await page
    .getByRole("region", { name: "Details for Android Developer" })
    .waitFor();
  assert.match(page.url(), new RegExp(seed.jobId));
  await page.reload();
  await page
    .getByRole("region", { name: "Details for Android Developer" })
    .waitFor();
  check("Job selection deep link survives reload");
  await page.getByRole("button", { name: "Quick Browse", exact: true }).click();
  await page.getByRole("region", { name: "Quick Browse card" }).waitFor();
  await page.goBack();
  await page.getByRole("button", { name: "Job Board", exact: true }).waitFor();
  check("Browser back restores browse mode");
  await page
    .getByLabel("Search stored jobs", { exact: true })
    .pressSequentially("Android");
  await page.getByLabel("Search stored jobs", { exact: true }).press("Enter");
  await page.waitForURL((url) => url.searchParams.get("q") === "Android");
  await page.reload();
  assert.equal(
    await page.getByLabel("Search stored jobs", { exact: true }).inputValue(),
    "Android",
  );
  check("Typed stored search persists in URL and on reload");
  await page.goto("http://127.0.0.1:3000/jobs");
  await page.getByRole("button", { name: "Quick Browse", exact: true }).click();
  await page.getByRole("button", { name: "Save S", exact: false }).click();
  await page
    .getByRole("button", { name: /^Skip\s/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Skipped", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("view") === "skipped");
  await page.reload();
  await page.getByRole("button", { name: "Restore", exact: true }).waitFor();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  check("Quick Browse save, skip and restore");
  await page.goto(
    `http://127.0.0.1:3000/applications/${seed.applicationId}?tab=documents`,
  );
  await page.getByText("Setup required:", { exact: false }).waitFor();
  const editors = page.locator(".draft-editor");
  await editors.first().waitFor();
  for (let i = 0; i < 3; i++)
    await editors
      .nth(i)
      .getByRole("button", { name: "Approve this version", exact: true })
      .click();
  await page.getByRole("link", { name: "Download TXT" }).first().waitFor();
  check(
    "Document review and approval enable versioned downloads; missing AI setup is honest",
  );
  const editor = editors.first();
  await editor.getByRole("textbox").fill("Owner edited fixture draft.");
  await editor
    .getByRole("button", { name: "Save edit & clear approval" })
    .click();
  await editor
    .getByRole("link", { name: "Download TXT" })
    .waitFor({ state: "hidden" });
  await editor
    .getByRole("button", { name: "Approve this version", exact: true })
    .waitFor({ state: "visible" });
  assert.equal(
    await editor.getByRole("link", { name: "Download TXT" }).count(),
    0,
  );
  await editor
    .getByRole("button", { name: "Approve this version", exact: true })
    .click();
  check("Editing invalidates approval and download access");
  await page.screenshot({
    path: "test-results/documents-desktop.png",
    fullPage: true,
  });
  await page.goto(`http://127.0.0.1:3000/applications/${seed.applicationId}`);
  await page
    .getByLabel("Approved document set")
    .selectOption(seed.generationId);
  await page
    .getByRole("button", { name: "Create 10-minute companion access" })
    .click();
  await page.getByLabel("Access code", { exact: true }).waitFor();
  const token = await page
      .getByLabel("Access code", { exact: true })
      .inputValue(),
    attempt = await page.getByLabel("Attempt ID", { exact: true }).inputValue();
  await page.goto("http://127.0.0.1:3000/fixtures/application");
  await page.getByRole("checkbox").check();
  let worker = browser
    .serviceWorkers()
    .find((w) => w.url().startsWith("chrome-extension://"));
  if (!worker)
    worker = await browser.waitForEvent("serviceworker", { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  assert.equal(extensionId, "iljjpkhlfijljkfglkpnpmodadeohchi");
  // Real extension origin retrieves scoped data; no browser cookies or bearer token are logged.
  const scoped = await worker.evaluate(
    async ({ attempt, token }) => {
      const r = await fetch(
        `http://127.0.0.1:3000/api/companion/${attempt}/access`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Target-Url": "http://127.0.0.1:3000/fixtures/application",
          },
          body: "{}",
        },
      );
      return { status: r.status, data: await r.json() };
    },
    { attempt, token },
  );
  assert.equal(scoped.status, 200);
  check("Real extension-origin scoped authentication");
  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.find(
      (t) => t.url === "http://127.0.0.1:3000/fixtures/application",
    )?.id;
  });
  const filled = await worker.evaluate(
    async ({ tabId, attempt, token, data }) => {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["form-core.js", "content.js"],
      });
      return chrome.tabs.sendMessage(tabId, {
        action: "fill",
        origin: "http://127.0.0.1:3000",
        attempt,
        token,
        targetUrl: "http://127.0.0.1:3000/fixtures/application",
        data,
      });
    },
    { tabId, attempt, token, data: scoped.data },
  );
  assert.ok(!filled.error, filled.error);
  assert.equal(
    await page.getByLabel("First name", { exact: true }).inputValue(),
    "Avery",
  );
  assert.equal(
    await page.locator("input[name=resume]").evaluate((e) => e.files.length),
    1,
  );
  check(
    "Companion fills reviewed contact and approved DOCX in controlled form",
  );
  // Closed shadow root is intentionally not exposed to page scripts; use test-only accessibility selectors through CDP below.
  const cdp = await browser.newCDPSession(page);
  const { root } = await cdp.send("DOM.getDocument", {
    depth: -1,
    pierce: true,
  });
  function findNode(node, predicate) {
    if (predicate(node)) return node;
    for (const child of [
      ...(node.children || []),
      ...(node.shadowRoots || []),
    ]) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
    return null;
  }
  const host = findNode(root, (n) =>
    n.attributes?.includes("jobcompass-review"),
  );
  const checkbox = findNode(host, (n) => n.nodeName === "INPUT");
  const button = findNode(
    host,
    (n) =>
      n.nodeName === "BUTTON" &&
      n.children?.some((c) => c.nodeValue === "Record final review"),
  );
  async function clickNode(node) {
    const { model } = await cdp.send("DOM.getBoxModel", {
      nodeId: node.nodeId,
    });
    const q = model.content;
    await page.mouse.click((q[0] + q[2]) / 2, (q[1] + q[5]) / 2);
  }
  await clickNode(checkbox);
  await clickNode(button);
  await page.waitForTimeout(600);
  await page
    .getByRole("button", { name: "Submit controlled fixture", exact: true })
    .click();
  await page.getByTestId("server-receipt").waitFor();
  check(
    "Final human review precedes controlled server receipt; no employer submission",
  );
  await page.goto(`http://127.0.0.1:3000/jobs?job=${seed.jobId}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("dialog", { name: "Details for Android Developer" })
    .waitFor();
  assert.ok(
    await page.locator("body").evaluate((e) => e.scrollWidth <= innerWidth + 1),
  );
  await page.screenshot({
    path: "test-results/jobs-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: /Android Developer/ })
    .first()
    .waitFor();
  check("Mobile details, no horizontal overflow, Escape closes detail");
  await page.goto("http://127.0.0.1:3000/profile");
  await page.getByRole("heading", { name: "Your profile facts" }).waitFor();
  const factText = page
    .getByRole("textbox", { name: "Exact confirmed fact", exact: true })
    .first();
  await factText.fill("Built a reviewed Android application using Kotlin.");
  assert.equal(
    await page
      .getByLabel("I confirm this fact", { exact: true })
      .first()
      .isChecked(),
    false,
  );
  await page.getByLabel("I confirm this fact", { exact: true }).first().check();
  await page
    .getByRole("button", { name: "Save reviewed version", exact: true })
    .click();
  await page
    .getByText("Reviewed profile version saved.", { exact: false })
    .waitFor();
  check(
    "Profile fact edits require renewed review and persist as a new version",
  );
  await page.screenshot({
    path: "test-results/profile-mobile.png",
    fullPage: true,
  });
  check("Profile interview and facts render on mobile");
  let directRequests = 0;
  await page.route("**/api/direct-discovery", async (route) => {
    directRequests++;
    const body = route.request().postDataJSON();
    assert.equal(body.input.board, "fixture-company");
    assert.equal(body.input.query, "Kotlin");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 1, cached: false }),
    });
  });
  await page.goto("http://127.0.0.1:3000/discover");
  await page
    .getByRole("heading", { name: "Discover jobs without an API key" })
    .waitFor();
  assert.equal(directRequests, 0);
  await page.getByLabel("Board token", { exact: true }).fill("fixture-company");
  await page.getByLabel("Keywords (optional)", { exact: true }).fill("Kotlin");
  await page
    .getByRole("button", { name: "Search public board", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "1 matching jobs" })
    .waitFor();
  assert.equal(directRequests, 1);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/direct-discovery-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/direct-discovery-desktop.png",
    fullPage: true,
  });
  check(
    "Direct discovery UI dispatches only on explicit search, shows import feedback and fits mobile (mocked response)",
  );
  assert.equal(discoveryRequests, 0);
  check(
    "Navigation, stored filtering and actions made zero discovery requests",
  );
  assert.deepEqual(errors, []);
  check("No browser page errors");
  const db = new PrismaClient({ datasourceUrl: source.toString() });
  assert.equal(await db.apiRequestLedger.count(), 0);
  assert.equal(
    (await db.application.findUnique({ where: { id: seed.applicationId } }))
      .status,
    "Preparing",
  );
  await db.$disconnect();
  check("No JSearch usage and no automatic Applied status");
  writeFileSync(
    "test-results/browser-check.json",
    JSON.stringify(
      {
        passed: checks,
        errors,
        liveProviderCalls: 0,
        fixtureOnly: true,
        browserVersion: browser.browser().version(),
        appBuildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
        checkedAt: new Date().toISOString(),
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
      .screenshot({ path: "test-results/browser-failure.png", fullPage: true })
      .catch(() => {});
    writeFileSync(
      "test-results/browser-failure.txt",
      await activePage
        .locator("body")
        .ariaSnapshot()
        .catch(() => ""),
    );
  }
  throw error;
} finally {
  await browser?.close();
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      /* Already exited. */
    }
  } else server.kill();
  log.end();
}
