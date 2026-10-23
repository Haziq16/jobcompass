import { readFile, mkdir, writeFile } from "node:fs/promises";
import JSZip from "jszip";
const files = [
  "manifest.json",
  "background.js",
  "fill-background.js",
  "fill-content.js",
  "popup.html",
  "popup.js",
  "popup.css",
  "content.js",
  "form-core.js",
];
const zip = new JSZip();
for (const name of files)
  zip.file(
    name,
    await readFile(new URL("../extension/" + name, import.meta.url)),
    { date: new Date("2026-01-01T00:00:00Z") },
  );
await mkdir(new URL("../public/downloads/", import.meta.url), {
  recursive: true,
});
await writeFile(
  new URL("../public/downloads/jobcompass-companion.zip", import.meta.url),
  await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
);
console.log("Packaged reviewed JobCompass Companion source (no credentials).");
