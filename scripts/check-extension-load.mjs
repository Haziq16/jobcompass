import { chromium } from "playwright-core";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const profile = await mkdtemp(
  path.join(tmpdir(), "jobcompass-extension-check-"),
);
const context = await chromium.launchPersistentContext(profile, {
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging"],
});
try {
  const cdp = await context.browser().newBrowserCDPSession();
  const result = await cdp.send("Extensions.loadUnpacked", {
    path: path.resolve("extension"),
  });
  console.log(JSON.stringify({ extensionId: result.id }));
} finally {
  await context.close();
}
