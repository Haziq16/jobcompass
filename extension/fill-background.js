const workspaces = [
  "http://127.0.0.1:3000",
  "https://jobcompass-haze-6576.vercel.app",
];
/* global importScripts */
importScripts("targets.js");
function identity(url) {
  return globalThis.JobCompassTargets.identity(url);
}
const key = (id) => "fill-tab-" + id;
async function tabSession(id) {
  return (await chrome.storage.session.get(key(id)))[key(id)];
}
async function saveSession(id, value) {
  await chrome.storage.session.set({ [key(id)]: value });
}
async function apiFor(tab, session, action, payload) {
  if (session.expiresAt <= Date.now())
    throw new Error("Connection expired. Return to your queue to reconnect.");
  if (identity(tab.url) !== identity(session.targetUrl))
    throw new Error("This tab is no longer the connected application.");
  const response = await fetch(
    session.origin + "/api/fill-companion/" + session.id + "/" + action,
    {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      headers: {
        Authorization: "Bearer " + session.token,
        "X-Target-Url": tab.url,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const data = await response.json().catch(() => {
    throw new Error(
      "The workspace refused this connection. Reconnect from your queue.",
    );
  });
  if (!response.ok)
    throw new Error(
      {
        profile_changed:
          "Your profile changed. Start a fresh connection from the queue.",
        invalid_grant:
          "Connection expired or revoked. Reconnect from the queue.",
        queue_required: "This job is no longer queued.",
      }[data.error] ||
        "JobCompass could not verify this connection (" + data.error + ").",
    );
  return data;
}
async function inject(tabId) {
  const tab = await chrome.tabs.get(tabId),
    session = await tabSession(tabId);
  if (!session) return;
  if (identity(tab.url) !== identity(session.targetUrl)) {
    await saveSession(tabId, {
      ...session,
      error:
        "Application redirected to an unsupported page. No filling performed.",
    });
    return;
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["targets.js", "application-engine.js", "fill-content.js"],
  });
  await saveSession(tabId, { ...session, error: null });
  await chrome.tabs.sendMessage(tabId, { action: "jc-start-fill" });
}
chrome.runtime.onMessageExternal.addListener((message, sender, respond) => {
  let origin;
  try {
    origin = new URL(sender.url).origin;
  } catch {
    return false;
  }
  if (!workspaces.includes(origin) || sender.frameId !== 0) return false;
  if (message.action === "jc-ping") {
    respond({ ok: true, version: "2.1.1" });
    return false;
  }
  if (message.action !== "jc-connect-fill") return false;
  (async () => {
    if (
      !/^[a-z0-9]+$/i.test(message.id) ||
      !/^[A-Za-z0-9_-]{43}$/.test(message.token) ||
      !identity(message.targetUrl)
    )
      throw new Error("Invalid application connection.");
    const expiry = new Date(message.expiresAt).valueOf();
    if (
      !Number.isFinite(expiry) ||
      expiry <= Date.now() ||
      expiry > Date.now() + 31 * 60000
    )
      throw new Error("Connection expired.");
    const tab = await chrome.tabs.create({ url: "about:blank", active: true });
    await saveSession(tab.id, {
      id: message.id,
      token: message.token,
      targetUrl: message.targetUrl,
      origin,
      expiresAt: expiry,
      workspaceTab: sender.tab?.id,
      autoSubmit: message.autoSubmit === true,
    });
    await chrome.tabs.update(tab.id, { url: message.targetUrl });
    return { ok: true, tabId: tab.id };
  })()
    .then(respond)
    .catch((e) => respond({ error: e.message }));
  return true;
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "complete")
    void inject(tabId).catch(async (e) => {
      const session = await tabSession(tabId);
      if (session) await saveSession(tabId, { ...session, error: e.message });
    });
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(key(tabId));
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    ![
      "jc-scan",
      "jc-report",
      "jc-rescan",
      "jc-status",
      "jc-inbox",
      "jc-submit",
      "jc-outcome",
      "jc-native-dropdown",
    ].includes(message.action)
  )
    return false;
  (async () => {
    const tabId = sender.tab?.id || message.tabId;
    if (!Number.isInteger(tabId))
      throw new Error("Open a connected application tab first.");
    const tab = await chrome.tabs.get(tabId),
      session = await tabSession(tabId);
    if (!session)
      throw new Error(
        "Start Fill application from a queued job in JobCompass.",
      );
    if (sender.tab && identity(sender.tab.url) !== identity(session.targetUrl))
      throw new Error("Application tab changed.");
    if (message.action === "jc-native-dropdown") {
      if (
        !sender.tab ||
        sender.frameId !== 0 ||
        session.expiresAt <= Date.now() ||
        identity(tab.url) !== identity(session.targetUrl)
      )
        throw new Error("Connection is not current.");
      const focused = await chrome.scripting.executeScript({
        target: { tabId },
        func: () =>
          document.activeElement?.getAttribute("role") === "combobox" &&
          !!document.activeElement.closest("form"),
      });
      if (!focused[0]?.result)
        throw new Error("Only the focused application dropdown can be opened.");
      await chrome.debugger.attach({ tabId }, "1.3");
      try {
        await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "ArrowDown",
          code: "ArrowDown",
          windowsVirtualKeyCode: 40,
        });
        await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "ArrowDown",
          code: "ArrowDown",
          windowsVirtualKeyCode: 40,
        });
      } finally {
        await chrome.debugger.detach({ tabId });
      }
      return { ok: true };
    }
    if (message.action === "jc-status")
      return {
        ok: true,
        connected: true,
        error: session.error || null,
        pendingSubmissionId: session.pendingSubmissionId,
        finalOutcome: session.finalOutcome,
        autoSubmit: session.autoSubmit,
      };
    if (message.action === "jc-rescan") {
      await inject(tabId);
      return { ok: true };
    }
    if (message.action === "jc-inbox") {
      await chrome.tabs.create({
        url:
          session.origin +
          "/application-profile?tab=inbox&job=" +
          encodeURIComponent(message.catalogId || ""),
      });
      return { ok: true };
    }
    const result = await apiFor(
      tab,
      session,
      message.action === "jc-scan"
        ? "scan"
        : message.action === "jc-report"
          ? "report"
          : message.action === "jc-submit"
            ? "submit"
            : "outcome",
      message.payload,
    );
    if (message.action === "jc-submit")
      await saveSession(tabId, {
        ...session,
        pendingSubmissionId: result.submissionId,
      });
    if (message.action === "jc-outcome")
      await saveSession(tabId, {
        ...session,
        pendingSubmissionId: null,
        finalOutcome: result.state,
      });
    if (message.action === "jc-scan")
      return {
        ...result,
        inboxUrl: session.origin + "/application-profile?tab=inbox",
      };
    return result;
  })()
    .then(respond)
    .catch((e) => respond({ error: e.message }));
  return true;
});
