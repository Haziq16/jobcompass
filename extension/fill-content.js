/* global setTimeout */
(() => {
  if (globalThis.jcFillInstalled) {
    globalThis.jcFillRestart?.();
    return;
  }
  globalThis.jcFillInstalled = true;
  let busy = false,
    lastReport = null;
  async function message(action, payload) {
    const r = await chrome.runtime.sendMessage({ action, payload });
    if (r?.error) throw new Error(r.error);
    return r;
  }
  globalThis.JobCompassNativeKey = () => message("jc-native-dropdown", {});
  function panel(text, report) {
    document.getElementById("jc-fill-panel")?.remove();
    const host = document.createElement("div");
    host.id = "jc-fill-panel";
    host.style.cssText =
      "position:fixed;bottom:16px;right:16px;width:min(380px,calc(100vw - 32px));z-index:2147483647";
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent =
      "section{font:14px/1.55 'Segoe UI',Arial,sans-serif;background:#fff;color:#202622;border:1px solid #a6afa9;padding:20px;max-height:65vh;overflow:auto}h2{font-size:19px;margin:0 0 10px}p{white-space:pre-wrap;overflow-wrap:anywhere}button{font:inherit;min-height:44px;padding:10px 12px;border:1px solid #cbd2cd;background:#f5f7f5;color:#202622;cursor:pointer;margin:6px 6px 0 0}button:focus-visible{outline:2px solid #202622}ul{padding-left:18px}";
    root.append(style);
    const section = document.createElement("section");
    section.setAttribute("aria-label", "JobCompass application assistance");
    const h = document.createElement("h2");
    h.textContent = "JobCompass application";
    section.append(h);
    const p = document.createElement("p");
    p.textContent = text;
    section.append(p);
    if (report) {
      const list = document.createElement("ul");
      for (const r of report.results.filter((r) =>
        ["needs_input", "failed"].includes(r.status),
      )) {
        const li = document.createElement("li");
        li.textContent = r.reason;
        list.append(li);
      }
      section.append(list);
    }
    for (const [text, action] of [
      ["Recheck and fill missing fields", () => void run()],
      [
        "Answer missing questions",
        () => void chrome.runtime.sendMessage({ action: "jc-inbox" }),
      ],
      ["Close panel", () => host.remove()],
    ]) {
      const b = document.createElement("button");
      b.textContent = text;
      b.onclick = action;
      section.append(b);
    }
    root.append(section);
    document.documentElement.append(host);
  }
  async function outcome(id) {
    panel(
      "Checking the employer confirmation. This will not click Submit again.",
    );
    const result = await globalThis.JobCompassEngine.observeOutcome();
    await message("jc-outcome", { submissionId: id, ...result });
    panel(
      result.outcome === "confirmed"
        ? "Employer confirmation observed. Your application tracker is updated."
        : result.outcome === "failed"
          ? "The employer rejected a validation check. Review it in JobCompass; no automatic retry will be made."
          : "The outcome is uncertain. Check the employer before retrying. JobCompass will not submit again automatically.",
    );
  }
  async function run() {
    if (busy) return;
    busy = true;
    try {
      const status = await message("jc-status");
      if (status.finalOutcome) {
        panel(
          "Recorded outcome: " +
            status.finalOutcome +
            ". No repeat submission will be made.",
        );
        return;
      }
      if (status.pendingSubmissionId) {
        await outcome(status.pendingSubmissionId);
        return;
      }
      panel("Reading the employer form and confirmed answers…");
      await globalThis.JobCompassEngine.openApplication();
      let plan, result, report;
      for (let cycle = 0; cycle < 4; cycle++) {
        let scan;
        for (let wait = 0; wait < 12; wait++) {
          try {
            scan = await globalThis.JobCompassEngine.scan();
            break;
          } catch (e) {
            if (wait === 11) throw e;
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        plan = await message("jc-scan", scan);
        result = await globalThis.JobCompassEngine.fill(plan);
        if (result.changed && cycle < 3) continue;
        const { changed, ...data } = result;
        void changed;
        report = await message("jc-report", {
          scanHash: plan.scanHash,
          revision: plan.revision,
          ...data,
        });
        break;
      }
      lastReport = report.report;
      if (
        plan.autoSubmit &&
        report.state === "filled" &&
        result.auditClean &&
        result.uploadVerified
      ) {
        panel(
          "Verified form ready. Sending the application you authorised for this job.",
        );
        const permission = await message("jc-submit", {
          fingerprint: result.fingerprint,
        });
        try {
          await globalThis.JobCompassEngine.clickSubmit(result.fingerprint);
        } catch (e) {
          await message("jc-outcome", {
            submissionId: permission.submissionId,
            outcome: "failed",
            url: location.href,
            marker: e.message,
            proof: "validation_rejection",
          });
          throw e;
        }
        await outcome(permission.submissionId);
      } else
        panel(
          report.state === "filled"
            ? `${report.report.filled} fields filled; ${report.report.preserved} existing entries preserved. ${plan.autoSubmit ? "Upload or final validation still needs attention; nothing was submitted." : "Automatic submission was not authorised. Submit yourself when ready."}`
            : `${report.report.requiredMissing} required fields need attention. ${result.blockers.join(" ")} Nothing was submitted.`,
          lastReport,
        );
    } catch (e) {
      panel(e.message, lastReport);
    } finally {
      busy = false;
    }
  }
  globalThis.jcFillRestart = () => void run();
  chrome.runtime.onMessage.addListener((m, s, respond) => {
    if (s.id !== chrome.runtime.id || m.action !== "jc-start-fill")
      return false;
    void run().then(() => respond({ ok: true }));
    return true;
  });
})();
