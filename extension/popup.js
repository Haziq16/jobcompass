const form = document.querySelector("#connect"),
  status = document.querySelector("#status");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const origin = new URL(document.querySelector("#origin").value).origin;
    if (
      ![
        "http://127.0.0.1:3000",
        "https://jobcompass-haze-6576.vercel.app",
      ].includes(origin)
    )
      throw new Error("Workspace origin is not allowed.");
    const attempt = document.querySelector("#attempt").value.trim(),
      token = document.querySelector("#token").value.trim();
    if (!/^[a-z0-9]+$/i.test(attempt)) throw new Error("Invalid attempt ID.");
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const targetUrl = tab.url;
    const target = new URL(targetUrl);
    if (!(
      (target.protocol === "https:" &&
        ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(
          target.hostname,
        )) ||
      (target.origin === "http://127.0.0.1:3000" &&
        target.pathname === "/fixtures/application")
    ))
      throw new Error("This application form is not supported.");
    const response = await fetch(`${origin}/api/companion/${attempt}/access`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Target-Url": targetUrl,
        "Content-Type": "application/json",
      },
      body: "{}",
      credentials: "omit",
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Access denied.");
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["form-core.js", "content.js"],
    });
    const result = await chrome.tabs.sendMessage(tab.id, {
      action: "fill",
      origin,
      attempt,
      token,
      targetUrl,
      data,
    });
    status.textContent = result.error || result.message;
    document.querySelector("#token").value = "";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
