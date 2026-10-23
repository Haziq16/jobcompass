/* global TextEncoder, setTimeout, crypto, KeyboardEvent, MouseEvent */
(() => {
  if (globalThis.JobCompassEngine) return;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    norm = (s) =>
      String(s || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
  const visible = (e) =>
    !!e &&
    !e.disabled &&
    !e.closest('[hidden],[aria-hidden="true"]') &&
    (!e.checkVisibility ||
      e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) &&
    Array.from(e.getClientRects()).some((r) => r.width > 0 && r.height > 0);
  let entries = [],
    form = null,
    lastUpload = null;
  function label(el) {
    if (
      el.type === "file" &&
      (/^(resume|resume-upload-input|resume-upload)$/i.test(el.id) ||
        /^resume$/i.test(el.name))
    )
      return "Resume/CV";
    const ids = (el.getAttribute("aria-labelledby") || "").split(/\s+/);
    const labelled = el.labels?.[0];
    const direct =
      labelled?.querySelector(
        ".application-label .text,.application-label,.field-label",
      )?.textContent ||
      labelled?.textContent ||
      el.getAttribute("aria-label") ||
      ids
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ")
        .trim();
    if (direct && norm(direct) !== "attach")
      return direct
        .trim()
        .replace(/\s*[*\u2731]\s*$/, "")
        .slice(0, 1000);
    const container = el.closest(
      'fieldset,.application-question,.ashby-application-form-field,.field,[data-testid="application-form-field"]',
    );
    const heading = container?.querySelector(
      "legend,label,.application-label,.field-label",
    );
    return (heading?.textContent || direct || el.name || el.id || "")
      .trim()
      .replace(/\s*[*\u2731]\s*$/, "")
      .slice(0, 1000);
  }
  function root(el) {
    return (
      el.closest(
        '[class*="value-container"],[class*="ValueContainer"],[class*="select__control"],[data-combobox-root]',
      ) || el.parentElement
    );
  }
  function selected(el) {
    const container = root(el),
      single = container?.querySelector(
        '[class*="single-value"],[class*="singleValue"],[data-selected-value]',
      );
    return (
      single?.textContent ||
      el.getAttribute("data-selected-value") ||
      el.value ||
      ""
    ).trim();
  }
  function has(entry) {
    const e = entry.els[0];
    if (entry.kind === "file") return !!e.files?.length || uploadAck(entry);
    if (entry.kind === "radio") return entry.els.some((e) => e.checked);
    if (entry.kind === "checkbox") return e.checked;
    if (entry.kind === "combobox") return !!selected(e);
    return !!String(e.value || "").trim();
  }
  function listFor(el) {
    const owned = (
      el.getAttribute("aria-controls") ||
      el.getAttribute("aria-owns") ||
      ""
    )
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const lists = owned.length
      ? owned
      : [...document.querySelectorAll("[role=listbox]")].filter(visible);
    if (lists.length !== 1) return [];
    return [...lists[0].querySelectorAll("[role=option]")].filter(
      (e) => visible(e) && e.getAttribute("aria-disabled") !== "true",
    );
  }
  async function openCombo(el) {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.click();
    await wait(150);
    return listFor(el);
  }
  function closeCombo(el) {
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
      }),
    );
    el.blur();
  }
  async function openApplication() {
    if (findForms().length) return;
    const info = globalThis.JobCompassTargets.info(location.href);
    if (!info) throw new Error("Unsupported application destination.");
    const anchors = [...document.querySelectorAll("a[href]")].filter(
      (a) =>
        visible(a) &&
        globalThis.JobCompassTargets.identity(a.href) === info.identity &&
        /\/(apply|application)(?:[?#]|$)/.test(a.href),
    );
    if (anchors.length === 1) {
      anchors[0].click();
      return;
    }
    const buttons = [...document.querySelectorAll("button,[role=tab]")].filter(
      (b) =>
        visible(b) &&
        /^(apply|apply now|apply for this job|application)$/i.test(
          b.textContent.trim(),
        ),
    );
    if (buttons.length === 1) buttons[0].click();
  }
  function findForms() {
    return [...document.querySelectorAll("form")].filter((f) =>
      f.querySelector(
        'input[type=email],input[name=email],input[name=first_name],input#email,input#first_name,input[name="name"],input[autocomplete=email]',
      ),
    );
  }
  function auxiliaryFrame(frame) {
    if (
      frame.title !== "LinkedIn Embedded Content" ||
      !frame.classList.contains("IN-widget--iframe") ||
      frame.closest(".required-field,[aria-required=true]")
    )
      return false;
    try {
      const url = new URL(frame.src);
      return (
        url.href === "about:blank" ||
        (url.protocol === "https:" &&
          ["www.linkedin.com", "platform.linkedin.com"].includes(url.hostname))
      );
    } catch {
      return false;
    }
  }
  function blockers() {
    const out = [];
    if (document.querySelector("input[type=password]"))
      out.push("Sign-in requires your action.");
    const captcha = [
      ...document.querySelectorAll(
        'iframe[src*="recaptcha"],iframe[src*="hcaptcha"],[data-sitekey]',
      ),
    ].some(visible);
    const solved = [
      ...document.querySelectorAll(
        'textarea[name="g-recaptcha-response"],textarea[name="h-captcha-response"],input[name="cf-turnstile-response"]',
      ),
    ].some((e) => !!e.value);
    if (captcha && !solved) out.push("Complete the employer CAPTCHA manually.");
    if (
      [
        ...(form?.querySelectorAll(
          'iframe:not([src*="recaptcha"]):not([src*="hcaptcha"])',
        ) || []),
      ].some((frame) => visible(frame) && !auxiliaryFrame(frame))
    )
      out.push("Embedded application controls need your action.");
    return out;
  }
  async function scan() {
    const forms = findForms();
    if (forms.length !== 1)
      throw new Error(
        forms.length
          ? "Multiple application forms need manual inspection."
          : "Application form not found. Open Apply, then recheck.",
      );
    form = forms[0];
    entries = [];
    const controls = [
      ...form.querySelectorAll("input,select,textarea,[role=combobox]"),
    ].filter(
      (e) =>
        (visible(e) ||
          (e.type === "file" &&
            !e.disabled &&
            (visible(e.parentElement) ||
              [...(e.labels || [])].some(visible)))) &&
        !["hidden", "button", "submit", "reset", "password"].includes(e.type),
    );
    const radio = new Set();
    for (const el of controls) {
      if (el.closest("[role=combobox]") && el.closest("[role=combobox]") !== el)
        continue;
      if (el.type === "radio") {
        if (radio.has(el.name)) continue;
        radio.add(el.name);
        const group = controls.filter(
            (e) => e.type === "radio" && e.name === el.name,
          ),
          owner = el.closest(
            "fieldset,[role=radiogroup],.application-question",
          );
        entries.push({
          els: group,
          id: "field-" + entries.length,
          label: (
            owner?.querySelector(
              "legend,.application-label .text,.application-label",
            )?.textContent ||
            owner?.getAttribute("aria-label") ||
            el.name
          )
            .trim()
            .replace(/\s*[*\u2731]\s*$/, ""),
          name: el.name,
          kind: "radio",
          required: group.some(
            (e) => e.required || e.getAttribute("aria-required") === "true",
          ),
          options: group.map((e) => ({ value: e.value, label: label(e) })),
          accept: "",
        });
        continue;
      }
      const custom = el.getAttribute("role") === "combobox";
      let choices = [];
      if (custom && !selected(el)) {
        try {
          choices = (await openCombo(el)).slice(0, 100).map((o) => ({
            value: o.textContent.trim(),
            label: o.textContent.trim(),
          }));
          closeCombo(el);
        } catch {
          /* Unknown widgets stay unresolved. */
        }
      }
      entries.push({
        els: [el],
        id: "field-" + entries.length,
        label: label(el),
        name: (el.name || el.id || "").slice(0, 200),
        kind: custom
          ? "combobox"
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
          (el.type === "file" && /^resume|cv/i.test(label(el))),
        options:
          el.tagName === "SELECT"
            ? [...el.options]
                .filter((o) => !o.disabled && o.value)
                .slice(0, 100)
                .map((o) => ({ value: o.value, label: o.textContent.trim() }))
            : choices,
        accept: el.accept || "",
      });
    }
    if (entries.length > 100)
      throw new Error("This form exceeds the supported control limit.");
    const out = blockers();
    if (
      !entries.some((e) => e.kind === "file" && /resume|\bcv\b/i.test(e.label))
    )
      out.push("No supported resume upload control found.");
    return {
      fields: entries.map((entry) => {
        const { els, ...e } = entry;
        void els;
        return { ...e, empty: !has(entry) };
      }),
      blockers: out,
    };
  }
  function value(el, v) {
    const p =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : el.tagName === "SELECT"
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(p, "value")?.set?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function digest(bytes) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  function uploadAck(entry) {
    if (!lastUpload) return false;
    const el = entry.els[0],
      container =
        el.closest(
          '[class*="file-upload"],[class*="upload"],.application-question,.ashby-application-form-field',
        ) || el.parentElement?.parentElement;
    return (
      !!container &&
      container.textContent.includes(lastUpload.filename) &&
      !container.querySelector("[aria-busy=true],[role=progressbar]") &&
      !!container.querySelector(
        'button[aria-label*="Remove"],button[aria-label*="remove"],[class*="filename"],[class*="fileName"],[data-upload-complete]',
      )
    );
  }
  async function fill(plan) {
    const results = [];
    for (const entry of entries) {
      const item = plan.fields.find((f) => f.id === entry.id),
        el = entry.els[0];
      let status = item?.status === "preserved" ? "preserved" : "needs_input",
        reason = item?.reason || "No confirmed answer.";
      try {
        if (!el.isConnected) throw new Error("Form changed; rescan.");
        if (has(entry)) {
          status = "preserved";
          reason = "Existing value preserved.";
        } else if (item?.status === "fill") {
          if (entry.kind === "combobox") {
            let choices = await openCombo(el);
            let match = choices.filter(
              (o) => norm(o.textContent) === norm(item.value),
            );
            if (!match.length && el.tagName === "INPUT") {
              value(el, item.value);
              await wait(400);
              choices = listFor(el);
              match = choices.filter(
                (o) => norm(o.textContent) === norm(item.value),
              );
            }
            if (match.length !== 1)
              throw new Error("No unique exact dropdown option.");
            match[0].click();
            await wait(200);
            if (norm(selected(el)) !== norm(item.value))
              throw new Error("Dropdown selection was not retained.");
          } else if (entry.kind === "radio") {
            const choices = entry.els.filter((e) => e.value === item.value);
            if (choices.length !== 1)
              throw new Error("Ambiguous radio option.");
            choices[0].click();
            if (!choices[0].checked)
              throw new Error("Choice was not retained.");
          } else {
            if (el.readOnly) throw new Error("Read-only control.");
            if (el.maxLength > 0 && item.value.length > el.maxLength)
              throw new Error("Answer exceeds the field limit.");
            value(el, item.value);
            if (el.value !== item.value)
              throw new Error("Value was not retained.");
          }
          status = "filled";
        } else if (item?.status === "file") {
          const doc = plan.document;
          if (!doc) throw new Error("Selected CV unavailable.");
          const ext = doc.filename.toLowerCase().endsWith(".pdf")
            ? ".pdf"
            : ".docx";
          if (
            entry.accept &&
            !entry.accept
              .split(",")
              .some((a) =>
                [ext, doc.mime, "*/*", "application/*"].includes(
                  a.trim().toLowerCase(),
                ),
              )
          )
            throw new Error("CV format not accepted.");
          const bytes = Uint8Array.from(atob(doc.base64), (c) =>
            c.charCodeAt(0),
          );
          if ((await digest(bytes)) !== doc.sha256)
            throw new Error("CV integrity check failed.");
          const transfer = new DataTransfer();
          transfer.items.add(
            new File([bytes], doc.filename, { type: doc.mime }),
          );
          el.files = transfer.files;
          lastUpload = { filename: doc.filename, sha256: doc.sha256 };
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          status = "filled";
        }
        if (entry.required && !has(entry)) {
          status = "needs_input";
          reason = "A required value is missing.";
        }
        if (
          entry.kind !== "combobox" &&
          el.checkValidity &&
          !el.checkValidity()
        ) {
          status = "needs_input";
          reason = "The value fails browser validation.";
        }
      } catch (e) {
        status = "failed";
        reason = e.message;
      }
      results.push({
        id: entry.id,
        status,
        reason: entry.label + ": " + reason,
      });
    }
    await wait(700);
    for (const entry of entries) {
      const r = results.find((r) => r.id === entry.id),
        p = plan.fields.find((f) => f.id === entry.id),
        el = entry.els[0];
      if (
        r.status === "filled" &&
        (!el.isConnected ||
          !has(entry) ||
          (entry.kind === "combobox"
            ? norm(selected(el)) !== norm(p.value)
            : !["file", "radio"].includes(entry.kind) && el.value !== p.value))
      ) {
        r.status = "failed";
        r.reason =
          entry.label + ": the page changed or cleared the value. Recheck.";
      }
    }
    const old = entries.map(({ els, options, ...e }) => {
      void els;
      void options;
      return e;
    });
    const current = await scan();
    const changed =
      JSON.stringify(old) !==
      JSON.stringify(
        entries.map(({ els, options, ...e }) => {
          void els;
          void options;
          return e;
        }),
      );
    const out = [...current.blockers];
    if (changed)
      out.push("Conditional fields changed; rescanning is required.");
    const inline = [
      ...form.querySelectorAll(
        "[aria-invalid=true],.error-message,[role=alert]",
      ),
    ].filter(visible);
    if (inline.length) out.push("Employer validation errors need attention.");
    const cv = entries.find(
      (e) => e.kind === "file" && /resume|\bcv\b/i.test(e.label),
    );
    let uploadVerified = false;
    if (
      cv &&
      lastUpload &&
      !(form.enctype === "multipart/form-data" && cv.els[0].name)
    ) {
      for (let attempt = 0; attempt < 20 && !uploadAck(cv); attempt++)
        await wait(500);
    }
    if (cv && plan.resume) {
      const el = cv.els[0];
      if (el.files?.length) {
        const exact =
          (await digest(await el.files[0].arrayBuffer())) ===
          plan.resume.sha256;
        uploadVerified =
          exact &&
          ((form.enctype === "multipart/form-data" && !!el.name) ||
            uploadAck(cv));
      } else
        uploadVerified =
          lastUpload?.sha256 === plan.resume.sha256 && uploadAck(cv);
    }
    const fingerprint = await fingerprintNow();
    return {
      results: results.map((r) => ({ ...r, reason: r.reason.slice(0, 300) })),
      blockers: out,
      changed,
      fingerprint,
      uploadVerified,
      auditClean:
        !changed &&
        !out.length &&
        !results.some((r) => r.status === "failed") &&
        entries.every((e) => !e.required || has(e)),
    };
  }
  async function fingerprintNow() {
    const data = entries.map((e) => ({
      id: e.id,
      label: e.label,
      kind: e.kind,
      value:
        e.kind === "file"
          ? [...(e.els[0].files || [])].map((f) => ({
              name: f.name,
              size: f.size,
              lastModified: f.lastModified,
            }))
          : e.kind === "radio"
            ? e.els.filter((e) => e.checked).map((e) => e.value)
            : e.kind === "checkbox"
              ? e.els[0].checked
              : e.kind === "combobox"
                ? selected(e.els[0])
                : e.els[0].value,
    }));
    return digest(new TextEncoder().encode(JSON.stringify(data)));
  }
  function submitButton() {
    if (!form) return null;
    const candidates = [
      ...form.querySelectorAll("button,input[type=submit]"),
    ].filter(
      (e) =>
        visible(e) &&
        (e.type === "submit" ||
          /^(submit application|submit|send application|apply now)$/i.test(
            (e.textContent || e.value || "").trim(),
          )),
    );
    return candidates.length === 1 ? candidates[0] : null;
  }
  async function clickSubmit(expected) {
    if ((await fingerprintNow()) !== expected)
      throw new Error(
        "The form changed after verification. No click was made.",
      );
    if (blockers().length || entries.some((e) => e.required && !has(e)))
      throw new Error("Required input or CAPTCHA remains. No click was made.");
    const button = submitButton();
    if (!button)
      throw new Error(
        "A unique submission button was not found. No click was made.",
      );
    button.click();
    return { clicked: true };
  }
  async function observeOutcome() {
    for (let i = 0; i < 50; i++) {
      const nodes = [
        ...document.querySelectorAll(
          '#application_confirmation,.application--confirmation,.application-confirmation,.application-success,#application-success,[data-testid="application-confirmation"],[data-testid="application-success"],main [role=status]',
        ),
      ].filter(visible);
      const node = nodes.find(
        (e) =>
          /thank you for (applying|your application)|application (has been |was )?(successfully )?(submitted|received)|we.ve received your application/i.test(
            e.textContent,
          ) && !e.querySelector("form"),
      );
      const active = findForms().some(visible);
      if (node && !active)
        return {
          outcome: "confirmed",
          url: location.href,
          marker: node.textContent.trim().slice(0, 300),
          proof: "platform_confirmation",
        };
      const errors = [
        ...document.querySelectorAll(
          "form [role=alert],form [aria-invalid=true],form .error-message",
        ),
      ].filter(visible);
      if (errors.length && active)
        return {
          outcome: "failed",
          url: location.href,
          marker: "Employer validation rejected the submitted form.",
          proof: "validation_rejection",
        };
      await wait(300);
    }
    return {
      outcome: "uncertain",
      url: location.href,
      marker: "No reliable employer receipt was observed.",
      proof: "no_receipt",
    };
  }
  globalThis.JobCompassEngine = {
    scan,
    fill,
    openApplication,
    fingerprintNow,
    clickSubmit,
    observeOutcome,
  };
})();
