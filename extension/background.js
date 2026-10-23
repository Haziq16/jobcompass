chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.action !== "attempt-report")
    return false;
  (async () => {
    if (!sender.tab || sender.tab.url !== message.targetUrl)
      throw new Error("The application tab changed.");
    if (
      ![
        "http://127.0.0.1:3000",
        "https://jobcompass-haze-6576.vercel.app",
      ].includes(message.origin)
    )
      throw new Error("Workspace is not allowed.");
    if (!/^[a-z0-9]+$/i.test(message.attempt))
      throw new Error("Invalid attempt.");
    const res = await fetch(
      `${message.origin}/api/companion/${message.attempt}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${message.token}`,
          "Content-Type": "application/json",
          "X-Target-Url": message.targetUrl,
        },
        body: JSON.stringify({
          state: message.state,
          unresolved: message.unresolved,
        }),
        credentials: "omit",
      },
    );
    if (!res.ok) throw new Error("Attempt access expired, changed or revoked.");
    return { ok: true };
  })()
    .then(respond)
    .catch((error) => respond({ error: error.message }));
  return true;
});
/* global importScripts */
importScripts("fill-background.js");
