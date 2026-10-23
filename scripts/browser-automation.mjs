/* global document, innerWidth */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { cvLayoutFixture } from "./cv-layout-fixture.mjs";
const origin = "http://127.0.0.1:3000",
  source = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(source.hostname));
const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";
const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
if (
  !(
    await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname='jobcompass_automation_test'`
  ).length
)
  await admin.$executeRawUnsafe("CREATE DATABASE jobcompass_automation_test");
await admin.$disconnect();
source.pathname = "/jobcompass_automation_test";
const env = {
  ...process.env,
  DATABASE_URL: source.toString(),
  APP_ACCESS: "hosted",
  APP_URL: origin,
  PUBLIC_SIGNUP: "true",
  OWNER_EMAIL: "auto-owner@release.example",
  MATCH_MODE: "owner",
  FILL_MODE: "owner",
  AUTOMATION_MODE: "owner",
  AUTOMATION_WORKER_SECRET: "automation-fixture-only-not-a-secret-123456789",
  AUTOMATION_APP_URL: origin,
  AUTOMATION_ALLOW_SUBMIT: "true",
  JOBCOMPASS_TEST: "true",
  JOBCOMPASS_BROWSER_CHECK_ID: randomUUID(),
  ENABLE_AI: "false",
  AI_MODE: "off",
  JSEARCH_API_KEY: "",
  BETTER_AUTH_SECRET: "automation-fixture-only-auth-over-32-characters",
  CHROME_EXECUTABLE_PATH:
    process.env.CHROME_EXECUTABLE_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
};
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env, stdio: "pipe" },
);
const db = new PrismaClient({ datasourceUrl: source.toString() });
await db.$executeRawUnsafe(
  'TRUNCATE "AutomationEvent","AutomationTask","AutomationSettings","ApplicationSubmission","ApplicationFillSession","CandidateProfile","ApplicationAnswer","ApplicationQuestion","MatchDecision","CatalogBoard","ResumeAsset","User","RateLimit","Profile","Settings","Job" CASCADE',
);
await mkdir("test-results", { recursive: true });
const log = createWriteStream("test-results/automation-browser-server.log"),
  server = spawn(
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
const checks = [];
let browser;
const check = (s) => {
  checks.push(s);
  console.log("PASS: " + s);
};
function html(platform, outcome = "confirmed") {
  const contact =
    platform === "greenhouse"
      ? '<label>First name<input id="first_name" required></label><label>Last name<input id="last_name" required></label>'
      : platform === "lever"
        ? '<label><div class="application-label">Full name<span>&#x2731;</span></div><input name="name" required></label><label><div class="application-label">Current location<span>&#x2731;</span></div><input name="location" required><div hidden>No location found. Try entering a different location</div></label>'
        : '<label>Full name<input name="name" required></label>';
  const authorization =
    platform === "ashby"
      ? '<label>Are you authorized to work in Singapore?<input role="combobox" id="authorization" aria-required="true" aria-controls="choices" readonly></label><div role="listbox" id="choices" hidden><div role="option">Yes</div><div role="option">No</div></div>'
      : platform === "lever"
        ? '<li class="application-question"><div><div class="application-label"><div class="text">Are you authorized to work in Singapore?<span>&#x2731;</span></div></div><div class="application-field"><label><input id="authorization" type="radio" name="cards[fixture][field0]" value="Yes" required>Yes</label><label><input type="radio" name="cards[fixture][field0]" value="No" required>No</label></div></div></li>'
        : '<label>Are you authorized to work in Singapore?<select id="authorization" required><option value="">Choose</option><option>Yes</option><option>No</option></select></label>';
  return `<!doctype html><html><body><h1>Fictional ${platform} application</h1><form enctype="multipart/form-data">${contact}<label>Email<input id="email" type="email" required></label><label>Resume/CV<input id="resume" name="resume" type="file" accept=".docx" required></label>${authorization}${platform === "lever" ? '<label><input type="checkbox">' + "Optional extra retention consent. ".repeat(18) + '</label><div data-sitekey="unrendered-fixture" style="width:300px;height:0;overflow:hidden"></div><iframe src="about:blank" hidden></iframe><iframe src="about:blank" title="LinkedIn Embedded Content" class="IN-widget IN-widget--iframe" style="width:188px;height:40px"></iframe><div data-sitekey="not-presented" style="visibility:hidden;width:300px;height:80px"></div>' : ""}<div id="conditional"></div>${outcome === "captcha" ? '<div data-sitekey="fixture">CAPTCHA needs human action</div>' : outcome === "frame" ? '<iframe title="Embedded application" src="about:blank" style="width:300px;height:80px"></iframe>' : ""}<button type="submit">Submit application</button></form><script>const a=document.getElementById('authorization');const reveal=()=>{if(a.value==='Yes'&&!document.querySelector('[name=availability]'))document.getElementById('conditional').innerHTML='<label>When can you start?<input name="availability" required></label>';};a.addEventListener('change',reveal);if(a.getAttribute('role')==='combobox'){const choices=document.getElementById('choices');a.addEventListener('click',()=>choices.hidden=false);a.addEventListener('keydown',e=>{if(e.key==='Escape')choices.hidden=true;});for(const option of choices.children)option.addEventListener('click',()=>{a.value=option.textContent;choices.hidden=true;a.dispatchEvent(new Event('change',{bubbles:true}));});}document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();document.querySelector('form').remove();const receipt=document.createElement('div');receipt.className=${JSON.stringify(outcome === "confirmed" ? "application-confirmation" : "unknown")};receipt.textContent=${JSON.stringify(outcome === "confirmed" ? "Application submitted successfully" : "We are processing your request")};document.body.append(receipt);});</script></body></html>`;
}
async function runWorker(platform, outcome) {
  const file = "test-results/automation-fixture.html";
  await writeFile(file, html(platform, outcome));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/automation-worker.mjs"], {
      env: { ...env, AUTOMATION_FIXTURE_PATH: file },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (b) => (output += b));
    child.stderr.on("data", (b) => (output += b));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error("Worker failed: " + output));
      else resolve(output);
    });
  });
}
try {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(origin + "/sign-in")).ok) break;
    } catch {
      /* Waiting for the isolated test server. */
    }
    if (i === 89) throw new Error("Server not ready");
    await delay(1000);
  }
  browser = await chromium.launch({
    executablePath: env.CHROME_EXECUTABLE_PATH,
    headless: true,
  });
  const context = await browser.newContext(),
    page = await context.newPage();
  const signup = await context.request.post(
    origin + "/api/auth/sign-up/email",
    {
      headers: { origin },
      data: {
        name: "Auto Owner",
        email: env.OWNER_EMAIL,
        password: "fixture-only-password-123-strong",
      },
    },
  );
  assert.equal(signup.status(), 200);
  const user = (await signup.json()).user;
  const uploaded = await context.request.post(
    origin + "/api/application-profile/import",
    {
      headers: { origin },
      multipart: {
        file: {
          name: "fictional-original.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          buffer: await cvLayoutFixture(),
        },
      },
    },
  );
  assert.equal(uploaded.status(), 200);
  const asset = (await uploaded.json()).cvSource;
  const values = {
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
      availability: "Immediately",
      noticePeriod: "",
      relocation: "unknown",
    },
    nothingToDeclare: [],
    cvSource: asset,
  };
  const profile = await context.request.post(
    origin + "/api/application-profile/profile",
    {
      headers: { origin },
      data: {
        values,
        expectedRevision: 0,
        confirmSections: ["contact", "eligibility", "preferences"],
      },
    },
  );
  assert.equal(profile.status(), 200, await profile.text());
  const settings = {
    enabled: true,
    submit: true,
    resumeAssetId: asset.assetId || asset.id,
    country: "Singapore",
    platforms: ["greenhouse", "lever", "ashby"],
    dailyLimit: 20,
    monthlyLimit: 60,
    consent: true,
  };
  // Source IDs are metadata; fetch the owned selection rather than assuming import response shape.
  settings.resumeAssetId = (
    await db.resumeAsset.findFirst({ where: { workspaceId: user.id } })
  ).id;
  const saved = await context.request.post(
    origin + "/api/automation/settings",
    { headers: { origin }, data: { values: settings, expectedRevision: 0 } },
  );
  assert.equal(saved.status(), 200, await saved.text());
  check("Owner configures explicit rules with confirmed original CV");
  let n = 0;
  for (const [platform, outcome] of [
    ["greenhouse", "confirmed"],
    ["lever", "confirmed"],
    ["ashby", "confirmed"],
    ["greenhouse", "uncertain"],
    ["ashby", "captcha"],
    ["lever", "frame"],
  ]) {
    n++;
    const id = n.toString().repeat(64),
      uuid = `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`,
      target =
        platform === "greenhouse"
          ? `https://job-boards.greenhouse.io/jobcompass-fixture/jobs/${100 + n}`
          : `https://jobs.${platform === "lever" ? "lever.co" : "ashbyhq.com"}/jobcompass-fixture/${uuid}`;
    await db.catalogBoard.create({
      data: {
        id: "auto-board-" + n,
        name: "Fictional Labs " + n,
        token: "fixture-" + n,
        platform,
        lastSuccessAt: new Date(),
        initialIndexedAt: new Date(),
      },
    });
    await db.catalogJob.create({
      data: {
        id,
        boardId: "auto-board-" + n,
        providerId: "auto:" + n,
        title: "Kotlin Engineer " + n,
        employer: "Fictional Labs",
        sourceUrl: target,
        applyUrl: target,
        hash: "fixture",
        searchText: "kotlin engineer",
      },
    });
    await db.matchDecision.create({
      data: {
        workspaceId: user.id,
        catalogId: id,
        providerId: "auto:" + n,
        applyUrl: target,
        state: "queued",
        snapshot: {
          title: "Kotlin Engineer " + n,
          employer: "Fictional Labs",
          applyUrl: target,
        },
      },
    });
    const disclosure = await context.request.get(
      origin + "/api/automation/consent?job=" + id,
    );
    assert.equal(disclosure.status(), 200);
    const consent = (await disclosure.json()).applicationConsent;
    assert.ok(consent?.token);
    const authorised = await context.request.post(
      origin + "/api/matches/decision",
      {
        headers: { origin },
        data: {
          requestId: randomUUID(),
          catalogId: id,
          state: "queued",
          expectedRevision: 1,
          applicationConsent: consent.token,
        },
      },
    );
    assert.equal(authorised.status(), 200, await authorised.text());
    assert.equal(
      (
        await context.request.post(origin + "/api/automation/enqueue", {
          headers: { origin },
          data: { catalogId: id },
        })
      ).status(),
      200,
    );
    const output = await runWorker(platform, outcome),
      task = await db.automationTask.findFirst({
        where: { workspaceId: user.id, catalogId: id },
      });
    assert.equal(
      task.state,
      ["captcha", "frame"].includes(outcome) ? "needs_input" : outcome,
      output + " " + task.detail,
    );
    const submission = await db.applicationSubmission.findFirst({
      where: { workspaceId: user.id, catalogId: id },
    });
    if (outcome === "confirmed") {
      assert.equal(submission.state, "confirmed");
      assert.equal(
        (
          await db.application.findUnique({
            where: { id: submission.applicationId },
          })
        ).status,
        "Applied",
      );
      if (platform === "lever") {
        const session = await db.applicationFillSession.findUniqueOrThrow({
          where: { id: task.sessionId },
        });
        assert.ok(
          session.scan.fields.some((f) => f.label === "Current location"),
        );
        assert.ok(
          session.scan.fields.some(
            (f) => f.label === "Are you authorized to work in Singapore?",
          ),
        );
        assert.ok(session.report.results.every((r) => r.reason.length <= 300));
        assert.equal(session.report.auditClean, true);
      }
      check(
        platform +
          " real browser fills conditional form and records verified receipt",
      );
    } else if (outcome === "uncertain") {
      assert.equal(submission.state, "uncertain");
      assert.notEqual(
        (
          await db.application.findUnique({
            where: { id: submission.applicationId },
          })
        ).status,
        "Applied",
      );
      check("Missing platform receipt stays uncertain without marking Applied");
    } else {
      assert.equal(submission, null);
      check(
        outcome === "captcha"
          ? "CAPTCHA pauses before any submission permission"
          : "Unknown embedded application frames still block submission",
      );
    }
  }
  assert.match(await runWorker("greenhouse", "confirmed"), /idle/);
  assert.equal(await db.applicationSubmission.count(), 4);
  check(
    "Subsequent worker does not retry completed, uncertain or blocked tasks",
  );
  const uiId = "7".repeat(64),
    uiTarget = "https://job-boards.greenhouse.io/jobcompass-fixture/jobs/777";
  await db.catalogJob.create({
    data: {
      id: uiId,
      boardId: "auto-board-1",
      providerId: "ui-consent:777",
      title: "Kotlin Engineer - Swipe consent",
      employer: "Named Fixture Employer",
      sourceUrl: uiTarget,
      applyUrl: uiTarget,
      hash: "fixture",
      searchText: "kotlin engineer",
      country: "Singapore",
      location: "Singapore",
    },
  });
  assert.equal(
    (
      await context.request.post(origin + "/api/matches/preferences", {
        headers: { origin },
        data: {
          values: {
            titles: ["Kotlin Engineer"],
            skills: ["Kotlin"],
            reviewed: true,
          },
          expectedRevision: 0,
        },
      })
    ).status(),
    200,
  );
  await page.goto(origin + "/discover");
  await page
    .getByRole("button", { name: "Authorise & apply", exact: true })
    .waitFor();
  await page
    .getByText("fictional-original.docx", { exact: false })
    .first()
    .waitFor();
  for (const [name, width, height] of [
    ["desktop", 1440, 1100],
    ["tablet", 768, 1024],
    ["phone", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `test-results/swipe-consent-${name}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  const decisionResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/matches/decision") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Authorise & apply", exact: true })
    .click();
  assert.equal((await decisionResponse).status(), 200);
  assert.equal(
    (await db.automationTask.findFirstOrThrow({ where: { catalogId: uiId } }))
      .state,
    "queued",
  );
  assert.ok(
    (await db.matchDecision.findFirstOrThrow({ where: { catalogId: uiId } }))
      .snapshot.applicationAuthorization,
  );
  check(
    "A real named-employer disclosure and authorise action queues one recipient-scoped automatic application",
  );
  await page.goto(origin + "/automation");
  await page.getByRole("heading", { name: "Your application rules" }).waitFor();
  for (const [name, width, height] of [
    ["desktop", 1440, 1100],
    ["tablet", 768, 1024],
    ["phone", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `test-results/automation-${name}.png`,
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const markup = await page.evaluate(() => {
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
        "<!doctype html><html><head><style>" +
        css +
        "</style></head>" +
        document.body.outerHTML +
        "</html>"
      );
    });
    await writeFile(`test-results/design-automation-${name}.html`, markup);
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page
    .getByRole("button", { name: "Use dark theme", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/automation-dark.png",
    animations: "disabled",
    fullPage: true,
  });
  check(
    "Real task history and settings render at desktop, tablet, phone and dark theme",
  );
  const current = await context.request.get(origin + "/api/automation");
  const body = await current.json();
  const paused = await context.request.post(
    origin + "/api/automation/settings",
    {
      headers: { origin },
      data: {
        values: { ...settings, enabled: false },
        expectedRevision: body.revision,
      },
    },
  );
  assert.equal(paused.status(), 200);
  check("Pause works through authenticated API");
  await writeFile(
    "test-results/automation-browser.json",
    JSON.stringify({ checks, passed: checks.length }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length }));
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
