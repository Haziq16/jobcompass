/* global document */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE_PATH
    ? { executablePath: process.env.CHROME_EXECUTABLE_PATH }
    : process.platform === "win32"
      ? {
          executablePath:
            "C:/Program Files/Google/Chrome/Application/chrome.exe",
        }
      : {}),
});
try {
  const page = await browser.newPage();
  await page.route("https://job-boards.greenhouse.io/fixture/jobs/123", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<form><label>Email<input type=email name=email value=fixture@example.test></label><div class=file-upload><label>Resume<input type=file id=resume></label></div><button type=submit>Submit Application</button></form><script>document.querySelector('#resume').addEventListener('change',e=>{const p=e.target.closest('.file-upload');const n=e.target.files[0].name;p.replaceChildren();const span=document.createElement('span');span.className='filename';span.textContent=n;p.append(span);const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Remove resume');p.append(b);});</script>`,
    }),
  );
  await page.goto("https://job-boards.greenhouse.io/fixture/jobs/123");
  for (const file of ["targets.js", "application-engine.js"])
    await page.addScriptTag({
      content: await readFile("extension/" + file, "utf8"),
    });
  const bytes = Buffer.from("fictional fixture document");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const result = await page.evaluate(
    async ({ sha256, base64 }) => {
      const engine = globalThis.JobCompassEngine;
      let scan = await engine.scan();
      const plan = {
        fields: scan.fields.map((f) => ({
          id: f.id,
          status: f.kind === "file" ? "file" : "preserved",
        })),
        resume: { sha256 },
        document: {
          filename: "fixture.pdf",
          mime: "application/pdf",
          sha256,
          base64,
        },
      };
      const first = await engine.fill(plan);
      scan = await engine.scan();
      const resumed = scan.fields.find((f) => f.kind === "file");
      const second = await engine.fill({
        ...plan,
        fields: scan.fields.map((f) => ({ id: f.id, status: "preserved" })),
      });
      document.querySelector(".file-upload").replaceChildren();
      const cleared = await engine.scan();
      return {
        firstVerified: first.uploadVerified,
        retained: !!resumed && !resumed.empty,
        secondVerified: second.uploadVerified,
        noFalseFailure: !second.results.some((r) => r.status === "failed"),
        clearedBlocked: cleared.blockers.includes(
          "No supported resume upload control found.",
        ),
      };
    },
    { sha256, base64: bytes.toString("base64") },
  );
  assert.deepEqual(result, {
    firstVerified: true,
    retained: true,
    secondVerified: true,
    noFalseFailure: true,
    clearedBlocked: true,
  });
  console.log(JSON.stringify(result));
  await page.route(
    "https://job-boards.greenhouse.io/fixture/jobs/456",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<form enctype="multipart/form-data"><label>Email<input type=email name=email value=fixture@example.test></label><label>Resume<input type=file id=resume name=resume></label><div class=value-container><label>Gender identity<input id=identity role=combobox aria-controls=choices required></label></div><button type=submit>Submit Application</button></form><script>document.querySelector('#identity').addEventListener('keydown',e=>{if(!e.isTrusted||e.key!=='ArrowDown')return;document.querySelector('#choices')?.remove();const list=document.createElement('div');list.id='choices';list.setAttribute('role','listbox');const option=document.createElement('div');option.setAttribute('role','option');option.textContent="I don't wish to answer";option.onclick=()=>{const chip=document.createElement('span');chip.className='select__multi-value__label';chip.textContent=option.textContent;e.target.closest('.value-container').append(chip);list.remove()};list.append(option);document.body.append(list)});</script>`,
      }),
  );
  await page.goto("https://job-boards.greenhouse.io/fixture/jobs/456");
  for (const file of ["targets.js", "application-engine.js"])
    await page.addScriptTag({
      content: await readFile("extension/" + file, "utf8"),
    });
  await page.exposeFunction("__openNative", () =>
    page.keyboard.press("ArrowDown"),
  );
  const multi = await page.evaluate(
    async ({ sha256, base64 }) => {
      globalThis.JobCompassNativeKey = () => globalThis.__openNative();
      const engine = globalThis.JobCompassEngine;
      let scan = await engine.scan();
      const plan = {
        fields: scan.fields.map((f) => ({
          id: f.id,
          status:
            f.kind === "file"
              ? "file"
              : f.kind === "combobox"
                ? "fill"
                : "preserved",
          value: "I don't wish to answer",
        })),
        resume: { sha256 },
        document: {
          filename: "fixture.pdf",
          mime: "application/pdf",
          sha256,
          base64,
        },
      };
      const first = await engine.fill(plan);
      scan = await engine.scan();
      const identity = scan.fields.find((f) => f.kind === "combobox");
      const second = await engine.fill({
        ...plan,
        fields: scan.fields.map((f) => ({ id: f.id, status: "preserved" })),
      });
      document.querySelector(".select__multi-value__label").remove();
      scan = await engine.scan();
      const cleared = await engine.fill({
        ...plan,
        fields: scan.fields.map((f) => ({ id: f.id, status: "preserved" })),
      });
      return {
        firstClean: first.auditClean,
        retained: !identity.empty,
        secondClean: second.auditClean,
        clearedBlocked: !cleared.auditClean,
      };
    },
    { sha256, base64: bytes.toString("base64") },
  );
  assert.deepEqual(multi, {
    firstClean: true,
    retained: true,
    secondClean: true,
    clearedBlocked: true,
  });
  console.log(JSON.stringify({ multiSelect: multi }));
} finally {
  await browser.close();
}
