document.querySelector("#recheck").addEventListener("click", async () => {
  const status = document.querySelector("#status"),
    button = document.querySelector("#recheck");
  button.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const response = await chrome.runtime.sendMessage({
      action: "jc-rescan",
      tabId: tab.id,
    });
    status.textContent =
      response?.error ||
      "Rechecking the connected form. See the JobCompass panel in the application tab.";
  } catch {
    status.textContent = "Open a connected Greenhouse application first.";
  } finally {
    button.disabled = false;
  }
});
