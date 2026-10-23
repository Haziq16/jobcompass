/* global AbortSignal */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// Temporary local fast lane; server-side approval, limits and leases remain authoritative.
const origin = "https://jobcompass-haze-6576.vercel.app";
const secret = process.env.AUTOMATION_WORKER_SECRET || "";
if (process.env.APP_URL !== origin || secret.length < 32)
  throw new Error("Invalid local worker configuration.");
const checkOnly = process.argv.includes("--check");
const guard = createServer();
await new Promise((resolve, reject) => {
  guard.once("error", reject);
  guard.listen({ host: "127.0.0.1", port: 32149, exclusive: true }, resolve);
});
let stopped = false;
let previous;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => { stopped = true; });
function log(status) {
  console.log(JSON.stringify({ at: new Date().toISOString(), status }));
}
async function pending() {
  const response = await fetch(origin + "/api/automation-worker/pending", {
    headers: { Authorization: "Bearer " + secret },
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Availability check failed.");
  return (await response.json()).pending === true;
}
try {
  log(checkOnly ? "checking_without_dispatch" : "watching_every_5_seconds");
  while (!stopped) {
    try {
      const ready = await pending();
      if (ready !== previous) log(ready ? "authorised_work_pending" : "waiting_for_authorised_work");
      previous = ready;
      if (checkOnly) break;
      if (ready && !stopped) {
        log("starting_one_authorised_application");
        const exitCode = await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [fileURLToPath(new URL("./automation-worker.mjs", import.meta.url))], {
            cwd: fileURLToPath(new URL("..", import.meta.url)),
            env: { ...process.env, AUTOMATION_APP_URL: origin, AUTOMATION_ALLOW_SUBMIT: "true" },
            stdio: ["ignore", "inherit", "inherit"],
            windowsHide: true,
          });
          child.once("error", reject);
          child.once("exit", (code) => resolve(code));
        });
        log(exitCode === 0 ? "worker_finished" : "worker_needs_attention_no_forced_retry");
      }
    } catch {
      log("availability_or_worker_error_retry_check_in_30_seconds");
      if (checkOnly) { process.exitCode = 1; break; }
      await delay(30000);
    }
    if (!stopped) await delay(5000);
  }
} finally {
  guard.close();
}
