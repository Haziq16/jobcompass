(() => {
  if (globalThis.jobCompassInstalled) return;
  globalThis.jobCompassInstalled = true;
  let session = null,
    unresolved = [],
    filled = [],
    approved = false;
  async function report(state) {
    const res = await chrome.runtime.sendMessage({
      action: "attempt-report",
      origin: session.origin,
      attempt: session.attempt,
      token: session.token,
      targetUrl: session.targetUrl,
      state,
      unresolved,
    });
    if (!res?.ok)
      throw new Error(
        res?.error ||
          "Attempt access expired, changed or revoked. Return to JobCompass.",
      );
  }
  function labelFor(input) {
    return (
      input.labels?.[0]?.textContent ||
      input.getAttribute("aria-label") ||
      input.name ||
      input.id ||
      "Unnamed required field"
    )
      .trim()
      .slice(0, 300);
  }
  function nativeValue(input, value) {
    const proto =
      input.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : input.tagName === "SELECT"
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function overlay() {
    document.querySelector("#jobcompass-review")?.remove();
    const host = document.createElement("div");
    host.id = "jobcompass-review";
    host.style.cssText =
      "position:fixed;right:14px;bottom:14px;width:340px;z-index:2147483647";
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent =
      "section{font:13px/1.5 system-ui;background:#f7f8f5;color:#253b32;padding:22px;border:2px solid #37654e;border-radius:12px;box-shadow:0 8px 35px #0003;max-height:70vh;overflow:auto}button{padding:10px;background:#37654e;color:white;border:0;border-radius:6px;margin-top:12px}button:disabled{opacity:.45}h2{font-size:18px}p{white-space:pre-wrap}";
    root.append(style);
    const panel = document.createElement("section"),
      title = document.createElement("h2");
    title.textContent = "JobCompass final review";
    panel.append(title);
    const message = document.createElement("p");
    message.textContent = unresolved.length
      ? `Action needed:\n${unresolved.join("\n")}`
      : `Filled: ${filled.join(", ")}.\nReview every field and attached document in the application form. This does not submit it.`;
    panel.append(message);
    const check = document.createElement("input");
    check.type = "checkbox";
    const label = document.createElement("label");
    label.append(
      check,
      document.createTextNode(" I reviewed the fields and documents."),
    );
    panel.append(label);
    const button = document.createElement("button");
    button.textContent = "Record final review";
    button.disabled = true;
    check.onchange = () => {
      button.disabled = !check.checked || unresolved.length > 0;
    };
    button.onclick = async () => {
      button.disabled = true;
      try {
        await report("final_review");
        approved = true;
        button.textContent = "Reviewed — submit using the employer’s button";
      } catch (e) {
        message.textContent = e.message;
      }
    };
    panel.append(button);
    const close = document.createElement("button");
    close.textContent = "Close panel";
    close.style.marginLeft = "10px";
    close.onclick = () => host.remove();
    panel.append(close);
    root.append(panel);
    document.documentElement.append(host);
    if (unresolved.length) {
      const recheck = document.createElement("button");
      recheck.textContent = "Recheck after manual changes";
      recheck.onclick = async () => {
        const required = [
          ...document.querySelectorAll("form input,form select,form textarea"),
        ].filter((e) => e.required && e.getClientRects().length && !e.disabled);
        unresolved = required.filter((e) => !e.checkValidity()).map(labelFor);
        if (
          document.querySelector(
            'input[type=password],iframe[src*="recaptcha"],iframe[src*="hcaptcha"],[data-sitekey],[role=combobox]:not(select),[role=radiogroup]',
          )
        )
          unresolved.push(
            "Login, CAPTCHA or unsupported custom controls remain.",
          );
        try {
          await report(unresolved.length ? "paused" : "filled");
          overlay();
        } catch (e) {
          message.textContent = e.message;
        }
      };
      panel.append(recheck);
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message.action !== "fill")
      return false;
    (async () => {
      if (location.href !== message.targetUrl)
        throw new Error(
          "The form URL changed. Create scoped access for the exact current URL.",
        );
      if (session)
        throw new Error(
          "Assistance already started on this page. Review the current attempt; do not repeat an uncertain submission.",
        );
      session = message;
      unresolved = [];
      filled = [];
      if (
        location.origin === "http://127.0.0.1:3000" &&
        location.pathname === "/fixtures/application"
      ) {
        const id = document.querySelector("input[name=companion_attempt]"),
          token = document.querySelector("input[name=companion_token]");
        if (id) nativeValue(id, message.attempt);
        if (token) nativeValue(token, message.token);
      }
      if (!["ready", "paused"].includes(message.data.state))
        throw new Error(
          "This attempt has already progressed. Review it in JobCompass before filling again.",
        );
      if (
        document.querySelector(
          'input[type=password],iframe[src*="recaptcha"],iframe[src*="hcaptcha"],[data-sitekey]',
        )
      ) {
        unresolved = [
          "Login or CAPTCHA requires your action. No fields filled.",
        ];
        await report("paused");
        overlay();
        return { message: "Paused for login or CAPTCHA." };
      }
      const controls = [
        ...document.querySelectorAll("form input,form textarea,form select"),
      ].filter(
        (e) =>
          e.getClientRects().length &&
          !e.disabled &&
          !["hidden", "submit", "button", "reset"].includes(e.type),
      );
      if (!controls.length) {
        unresolved = ["Unsupported form or embedded frame."];
        await report("paused");
        overlay();
        return { message: "Unsupported controls; no fields filled." };
      }
      for (const input of controls) {
        const label = labelFor(input);
        if (input.readOnly) {
          if (input.required && !input.value) unresolved.push(label);
          continue;
        }
        if (input.type === "file") {
          const kind = /cover/i.test(`${input.name} ${label}`)
            ? "cover_letter"
            : /resume|cv/i.test(`${input.name} ${label}`)
              ? "resume"
              : null;
          const doc = message.data.documents.find((d) => d.kind === kind);
          if (
            !doc ||
            (input.accept && !/docx|officedocument|\*/i.test(input.accept))
          ) {
            if (input.required)
              unresolved.push(
                `${label} — manually upload an approved compatible file`,
              );
            continue;
          }
          const bytes = Uint8Array.from(atob(doc.base64), (c) =>
              c.charCodeAt(0),
            ),
            file = new File([bytes], doc.filename, {
              type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            }),
            transfer = new DataTransfer();
          transfer.items.add(file);
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          filled.push(label);
          continue;
        }
        if (
          input.tagName === "TEXTAREA" &&
          /cover.?letter/i.test(`${input.name} ${label}`)
        ) {
          const doc = message.data.documents.find(
            (d) => d.kind === "cover_letter",
          );
          if (doc) {
            nativeValue(input, doc.content);
            filled.push(label);
            continue;
          }
        }
        const value = globalThis.JobCompassRules.resolveField(
          input.name || input.id,
          label,
          message.data.fields,
        );
        if (["checkbox", "radio"].includes(input.type)) {
          if (input.required && !input.checked)
            unresolved.push(`${label} — choose manually`);
          continue;
        }
        if (value !== null) {
          if (input.tagName === "SELECT") {
            const option = [...input.options].find(
              (o) => o.value === value || o.text === value,
            );
            if (option) nativeValue(input, option.value);
            else unresolved.push(label);
          } else nativeValue(input, value);
          filled.push(label);
        } else if (input.required && !input.value) unresolved.push(label);
      }
      if (controls.some((e) => e.required && !e.checkValidity()))
        unresolved.push("Some required fields need a valid value.");
      if (
        document.querySelector("[role=combobox]:not(select),[role=radiogroup]")
      )
        unresolved.push("Custom application controls require manual handling.");
      unresolved = [...new Set(unresolved)];
      await report(unresolved.length ? "paused" : "filled");
      overlay();
      document.querySelectorAll("form").forEach((form) =>
        form.addEventListener(
          "input",
          () => {
            if (approved) {
              approved = false;
              void report("paused").catch(() => {});
              overlay();
            }
          },
          true,
        ),
      );
      document.querySelectorAll("form").forEach((form) =>
        form.addEventListener(
          "submit",
          (event) => {
            if (!approved) {
              event.preventDefault();
              event.stopImmediatePropagation();
              overlay();
              return;
            }
            // Human owns the submit action. A successful click does not prove acceptance.
            void report("submitting")
              .then(() => report("uncertain"))
              .catch(() => {});
          },
          true,
        ),
      );
      return {
        message: unresolved.length
          ? "Paused. Resolve missing fields manually, then create a fresh reviewed attempt."
          : "Fields filled. Complete the final-review panel before using the employer Submit button.",
      };
    })()
      .then(respond)
      .catch((error) => respond({ error: error.message }));
    return true;
  });
})();
