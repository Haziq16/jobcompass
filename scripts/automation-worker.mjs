/* global AbortSignal, setTimeout, clearTimeout */
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url),
  targets = require("../extension/targets.js");
const origin = process.env.AUTOMATION_APP_URL || process.env.APP_URL || "",
  secret = process.env.AUTOMATION_WORKER_SECRET || "";
const url = new URL(origin),
  fixture =
    process.env.JOBCOMPASS_TEST === "true" && url.hostname === "127.0.0.1";
if (
  (url.protocol !== "https:" && !fixture) ||
  url.pathname !== "/" ||
  url.username ||
  url.password ||
  url.search ||
  secret.length < 32
)
  throw new Error("Invalid worker configuration.");
if (!fixture && origin !== "https://jobcompass-haze-6576.vercel.app")
  throw new Error("Unexpected production workspace.");
const headers = {
  authorization: "Bearer " + secret,
  origin,
  "Content-Type": "application/json",
};
async function api(action, body) {
  const response = await fetch(origin + "/api/automation-worker/" + action, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok)
    throw new Error("Worker request refused (" + response.status + ").");
  return response.json();
}
let browser,
  task,
  cdp,
  world,
  page,
  done = false,
  timedOut = false,
  submitting = false;
const watchdog = setTimeout(() => {
  timedOut = true;
  void browser?.close();
}, 180000);
const sources = await Promise.all(
  ["targets.js", "application-engine.js"].map((f) =>
    readFile(new URL("../extension/" + f, import.meta.url), "utf8"),
  ),
);
async function ensureWorld() {
  if (world) {
    try {
      await cdp.send("Runtime.evaluate", {
        contextId: world,
        expression: "Boolean(globalThis.JobCompassEngine)",
        returnByValue: true,
      });
      return;
    } catch {
      world = null;
    }
  }
  const tree = await cdp.send("Page.getFrameTree");
  world = (
    await cdp.send("Page.createIsolatedWorld", {
      frameId: tree.frameTree.frame.id,
      worldName: "jobcompass-worker",
      grantUniveralAccess: false,
    })
  ).executionContextId;
  for (const source of sources)
    await cdp.send("Runtime.evaluate", {
      contextId: world,
      expression: source,
    });
}
async function call(name, arg) {
  if (timedOut) throw new Error("Worker deadline reached.");
  await ensureWorld();
  const r = await cdp.send("Runtime.evaluate", {
    contextId: world,
    expression:
      "globalThis.JobCompassEngine." +
      name +
      "(" +
      (arg === undefined ? "" : JSON.stringify(arg)) +
      ")",
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error("Browser operation failed.");
  return r.result.value;
}
async function request(action, payload) {
  if (timedOut && action !== "finish")
    throw new Error("Worker deadline reached.");
  const targetUrl = page?.url() || task.grant.targetUrl;
  if (targets.identity(targetUrl) !== targets.identity(task.grant.targetUrl))
    throw new Error("Application redirected outside the authorised job.");
  return api(action, {
    taskId: task.taskId,
    leaseToken: task.leaseToken,
    grantToken: task.grant.token,
    targetUrl,
    payload,
  });
}
try {
  task = (await api("claim", {})).task;
  if (!task) {
    console.log(JSON.stringify({ status: "idle" }));
  } else {
    const executablePath = process.env.CHROME_EXECUTABLE_PATH;
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ["--disable-dev-shm-usage"],
    });
    const context = await browser.newContext();
    if (fixture && process.env.AUTOMATION_FIXTURE_PATH) {
      const html = await readFile(
        path.resolve(process.env.AUTOMATION_FIXTURE_PATH),
        "utf8",
      );
      await context.route(
        /https:\/\/(job-boards\.greenhouse\.io|boards\.greenhouse\.io|jobs\.lever\.co|jobs\.eu\.lever\.co|jobs\.ashbyhq\.com)\//,
        (route) =>
          route.fulfill({ status: 200, contentType: "text/html", body: html }),
      );
    }
    page = await context.newPage();
    await page.goto(task.grant.targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    cdp = await context.newCDPSession(page);
    await call("openApplication").catch(() => {
      world = null;
    });
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    let plan, result, report;
    for (let cycle = 0; cycle < 4; cycle++) {
      let scan;
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          scan = await call("scan");
          break;
        } catch (error) {
          if (attempt === 11) throw error;
          await page.waitForTimeout(500);
          world = null;
        }
      }
      plan = await request("scan", scan);
      result = await call("fill", plan);
      if (result.changed && cycle < 3) continue;
      const { changed, ...data } = result;
      void changed;
      report = await request("report", {
        scanHash: plan.scanHash,
        revision: plan.revision,
        ...data,
      });
      break;
    }
    if (
      plan.autoSubmit &&
      process.env.AUTOMATION_ALLOW_SUBMIT === "true" &&
      report.state === "filled" &&
      result.auditClean &&
      result.uploadVerified
    ) {
      const permission = await request("submit", {
        fingerprint: result.fingerprint,
      });
      submitting = true;
      try {
        await call("clickSubmit", result.fingerprint);
      } catch {
        /* A navigation can destroy the isolated world after the click. Never click again. */
      }
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      world = null;
      const outcome = await call("observeOutcome");
      await request("outcome", {
        submissionId: permission.submissionId,
        ...outcome,
      });
      done = true;
      console.log(
        JSON.stringify({ status: outcome.outcome, automaticRetry: false }),
      );
    } else {
      const result = await request("finish", {});
      done = true;
      console.log(JSON.stringify({ status: result.state, submitted: false }));
    }
  }
} catch (e) {
  if (task && !done) {
    try {
      await request("finish", {
        error: submitting
          ? "Worker interrupted after submission authorisation. Check outcome; no automatic retry."
          : "Worker stopped before submission. Check the task and its required inputs.",
      });
    } catch {
      /* Server lease recovery preserves uncertain outcomes. */
    }
  }
  console.error(
    JSON.stringify({
      status: submitting ? "uncertain" : "needs_attention",
      error: e.name,
      automaticRetry: false,
    }),
  );
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  if (browser) await browser.close();
}
