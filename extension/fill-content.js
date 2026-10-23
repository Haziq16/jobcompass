/* global setTimeout, crypto */
(() => {
  if (globalThis.jcFillInstalled) {
    globalThis.jcFillRestart?.();
    return;
  }
  globalThis.jcFillInstalled = true;
  let busy = false,
    lastReport = null;
  const visible = (e) =>
    !e.disabled &&
    !e.closest('[hidden],[aria-hidden="true"]') &&
    e.getClientRects().length > 0;
  function label(el) {
    if (el.type === "file" && el.id === "resume") return "Resume/CV";
    const ids = (el.getAttribute("aria-labelledby") || "").split(/\s+/);
    return (
      el.labels?.[0]?.textContent ||
      el.getAttribute("aria-label") ||
      ids
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ")
        .trim() ||
      el.name ||
      el.id ||
      ""
    )
      .trim()
      .slice(0, 1000)
      .replace(/\s*\*\s*$/, "");
  }
  function hasValue(entry) {
    const el = entry.els[0];
    return entry.kind === "file"
      ? Boolean(el.files?.length)
      : entry.kind === "radio"
        ? entry.els.some((e) => e.checked)
        : entry.kind === "checkbox"
          ? el.checked
          : typeof el.value === "string" && Boolean(el.value.trim());
  }
  function collect() {
    const forms = [...document.querySelectorAll("form")].filter((f) =>
      f.querySelector(
        "input[type=email],input[name=email],input[name=first_name],input#email,input#first_name",
      ),
    );
    if (forms.length !== 1)
      throw new Error(
        forms.length
          ? "Multiple application forms found. Choose fields manually."
          : "Application form not found yet. Open its Apply section, then Recheck.",
      );
    const form = forms[0],
      controls = [
        ...form.querySelectorAll("input,textarea,select,[role=combobox]"),
      ].filter(
        (e) =>
          (visible(e) ||
            (e.type === "file" &&
              !e.disabled &&
              e.parentElement &&
              (visible(e.parentElement) ||
                [...(e.labels || [])].some(visible)))) &&
          !["hidden", "submit", "button", "reset", "password"].includes(e.type),
      );
    const entries = [],
      radioNames = new Set();
    for (const el of controls) {
      if (el.type === "radio") {
        if (radioNames.has(el.name)) continue;
        radioNames.add(el.name);
        const group = controls.filter(
          (e) => e.type === "radio" && e.name === el.name,
        );
        const owner = el.closest("fieldset,[role=radiogroup]");
        const title =
          owner?.querySelector("legend")?.textContent ||
          owner?.getAttribute("aria-label");
        entries.push({
          els: group,
          id: "field-" + entries.length,
          label: (title || el.name).trim().slice(0, 1000),
          name: el.name,
          kind: "radio",
          required: group.some((e) => e.required),
          empty: !group.some((e) => e.checked),
          options: group.map((e) => ({ value: e.value, label: label(e) })),
          accept: "",
        });
        continue;
      }
      if (entries.some((e) => e.els.includes(el))) continue;
      const custom = el.getAttribute("role") === "combobox";
      entries.push({
        els: [el],
        id: "field-" + entries.length,
        label: label(el),
        name: (el.name || el.id || "").slice(0, 200),
        kind: custom
          ? "unsupported"
          : el.tagName === "SELECT"
            ? "select"
            : el.tagName === "TEXTAREA"
              ? "textarea"
              : ["email", "tel", "url", "number", "checkbox", "file"].includes(
                    el.type,
                  )
                ? el.type
                : "text",
        required:
          el.required ||
          el.getAttribute("aria-required") === "true" ||
          (el.type === "file" && el.id === "resume"),
        empty:
          el.type === "file"
            ? !el.files?.length
            : el.type === "checkbox"
              ? !el.checked
              : !String(el.value || "").trim(),
        options:
          el.tagName === "SELECT"
            ? [...el.options]
                .filter((o) => !o.disabled && o.value)
                .slice(0, 100)
                .map((o) => ({ value: o.value, label: o.textContent.trim() }))
            : [],
        accept: el.accept || "",
      });
    }
    if (entries.length > 100)
      throw new Error(
        "This form has more than 100 controls. Complete it manually.",
      );
    const blockers = [];
    if (
      !entries.some((e) => e.kind === "file" && /^(resume|cv)/i.test(e.label))
    )
      blockers.push(
        "No supported resume upload control was found. Check the selected CV on the employer form and attach it manually if needed.",
      );
    if (form.querySelector("input[type=password]"))
      blockers.push("Sign-in requires your action.");
    if (
      document.querySelector(
        'iframe[src*="recaptcha"],iframe[src*="hcaptcha"],[data-sitekey]',
      )
    )
      blockers.push(
        "Complete the employer CAPTCHA manually before submitting.",
      );
    if (form.querySelector("iframe"))
      blockers.push("Embedded form controls require manual inspection.");
    return { form, entries, blockers };
  }
  function setValue(el, value) {
    const proto =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : el.tagName === "SELECT"
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function message(action, payload) {
    const r = await chrome.runtime.sendMessage({ action, payload });
    if (r?.error) throw new Error(r.error);
    return r;
  }
  function panel(text, report) {
    document.getElementById("jc-fill-panel")?.remove();
    const host = document.createElement("div");
    host.id = "jc-fill-panel";
    host.style.cssText =
      "position:fixed;bottom:16px;right:16px;width:min(380px,calc(100vw - 32px));z-index:2147483647";
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent =
      "section{font:14px/1.55 'Segoe UI',Arial,sans-serif;background:#fff;color:#202622;border:1px solid #a6afa9;padding:20px;max-height:65vh;overflow:auto}h2{font-size:19px;margin:0 0 10px}p{white-space:pre-wrap;overflow-wrap:anywhere}button{font:inherit;min-height:44px;padding:10px 12px;border:1px solid #cbd2cd;background:#f5f7f5;color:#202622;cursor:pointer;margin:6px 6px 0 0}button:focus-visible{outline:2px solid #202622}ul{padding-left:18px}small{color:#59635e}";
    root.append(style);
    const section = document.createElement("section");
    section.setAttribute("aria-label", "JobCompass application assistance");
    const h = document.createElement("h2");
    h.textContent = "JobCompass application fill";
    section.append(h);
    const p = document.createElement("p");
    p.textContent = text;
    section.append(p);
    if (report) {
      const list = document.createElement("ul");
      for (const item of report.results.filter((r) =>
        ["needs_input", "failed"].includes(r.status),
      )) {
        const li = document.createElement("li");
        li.textContent = item.reason;
        list.append(li);
      }
      section.append(list);
    }
    const recheck = document.createElement("button");
    recheck.textContent = "Recheck and fill missing fields";
    recheck.onclick = () => void run();
    section.append(recheck);
    const inbox = document.createElement("button");
    inbox.textContent = "Answer missing questions";
    inbox.onclick = () =>
      void chrome.runtime.sendMessage({ action: "jc-inbox" });
    section.append(inbox);
    const close = document.createElement("button");
    close.textContent = "Close panel";
    close.onclick = () => host.remove();
    section.append(close);
    const small = document.createElement("p");
    small.textContent =
      "Nothing was submitted. Check all fields and uploads on the employer form before using its Submit button.";
    section.append(small);
    root.append(section);
    document.documentElement.append(host);
  }
  async function run() {
    if (busy) return;
    busy = true;
    try {
      panel("Reading the application form…");
      let collected;
      for (let i = 0; i < 12; i++) {
        try {
          collected = collect();
          break;
        } catch (e) {
          if (i === 11) throw e;
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      const { entries, blockers } = collected;
      const descriptor = ({ els, ...field }) => {
        void els;
        return field;
      };
      const plan = await message("jc-scan", {
        fields: entries.map(descriptor),
        blockers,
      });
      const results = [];
      for (const entry of entries) {
        const item = plan.fields.find((f) => f.id === entry.id),
          el = entry.els[0];
        let status = item?.status === "preserved" ? "preserved" : "needs_input",
          reason = item?.reason || "No confirmed mapping.";
        try {
          if (!el.isConnected)
            throw new Error("The form changed; recheck before continuing.");
          if (entry.empty && hasValue(entry)) {
            status = "preserved";
            reason =
              "You changed this value while JobCompass was checking; preserved.";
          } else if (item?.status === "fill" && entry.empty) {
            if (el.readOnly)
              throw new Error("Read-only control requires your action.");
            if (entry.kind === "radio") {
              const choices = entry.els.filter((e) => e.value === item.value);
              if (choices.length !== 1) throw new Error("Ambiguous choice.");
              choices[0].click();
              if (!choices[0].checked)
                throw new Error("The form did not retain this choice.");
            } else {
              if (el.maxLength > 0 && item.value.length > el.maxLength)
                throw new Error(
                  "The confirmed answer is longer than this field allows. Edit it manually.",
                );
              setValue(el, item.value);
              if (el.value !== item.value)
                throw new Error("The form did not retain this value.");
            }
            status = "filled";
          } else if (item?.status === "file" && entry.empty) {
            const doc = plan.document;
            if (!doc) throw new Error("Selected CV unavailable.");
            const ext = doc.filename.toLowerCase().endsWith(".pdf")
              ? ".pdf"
              : ".docx";
            const accept = entry.accept
              .toLowerCase()
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (
              accept.length &&
              !accept.some(
                (a) =>
                  a === ext ||
                  a === doc.mime ||
                  a === "*/*" ||
                  a === "application/*",
              )
            )
              throw new Error(
                "This upload does not accept the selected CV format.",
              );
            const bytes = Uint8Array.from(atob(doc.base64), (c) =>
              c.charCodeAt(0),
            );
            const digest = [
              ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            ]
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
            if (digest !== doc.sha256)
              throw new Error("CV integrity check failed.");
            const transfer = new DataTransfer();
            transfer.items.add(
              new File([bytes], doc.filename, { type: doc.mime }),
            );
            el.files = transfer.files;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            if (el.files.length !== 1 || el.files[0].size !== bytes.length)
              throw new Error("The form did not retain the selected CV.");
            status = "filled";
          }
          if (
            entry.required &&
            (!hasValue(entry) ||
              (typeof el.checkValidity === "function" && !el.checkValidity()))
          ) {
            status = "needs_input";
            reason = "Invalid value: " + entry.label;
          }
        } catch (e) {
          status = "failed";
          reason = entry.label + ": " + e.message;
        }
        results.push({ id: entry.id, status, reason });
      }
      await new Promise((r) => setTimeout(r, 600));
      for (const entry of entries) {
        const result = results.find((r) => r.id === entry.id),
          item = plan.fields.find((f) => f.id === entry.id),
          el = entry.els[0];
        if (
          result.status === "filled" &&
          (!el.isConnected ||
            (entry.kind === "file"
              ? !el.files?.length
              : entry.kind === "radio"
                ? !entry.els.some((e) => e.checked && e.value === item.value)
                : el.value !== item.value))
        ) {
          result.status = "failed";
          result.reason =
            entry.label + ": the page changed or cleared the value. Recheck.";
        }
      }
      for (const entry of entries) {
        if (entry.required && !hasValue(entry)) {
          const result = results.find((r) => r.id === entry.id);
          result.status = "needs_input";
          result.reason = entry.label + ": a required value is still missing.";
        }
      }
      const finalBlockers = [...blockers];
      try {
        if (
          JSON.stringify(
            collect().entries.map(({ els, empty, ...f }) => {
              void els;
              void empty;
              return f;
            }),
          ) !==
          JSON.stringify(
            entries.map(({ els, empty, ...f }) => {
              void els;
              void empty;
              return f;
            }),
          )
        )
          finalBlockers.push(
            "The form added or removed controls. Recheck the new fields.",
          );
      } catch {
        finalBlockers.push("The application form changed. Recheck it.");
      }
      const reported = await message("jc-report", {
        scanHash: plan.scanHash,
        revision: plan.revision,
        results,
        blockers: finalBlockers,
      });
      lastReport = reported.report;
      panel(
        reported.state === "filled"
          ? `${reported.report.filled} fields filled; ${reported.report.preserved} existing values preserved. Required native fields passed the browser checks. Review the employer form.`
          : `${reported.report.filled} fields filled. ${reported.report.requiredMissing} required fields still need you. ${finalBlockers.join(" ")}`,
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
