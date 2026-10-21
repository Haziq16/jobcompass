import { generateKeyPairSync, createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";
const file = "extension/manifest.json";
const manifest = JSON.parse(readFileSync(file, "utf8"));
if (!manifest.key) {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  manifest.key = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
}
const digest = createHash("sha256")
  .update(Buffer.from(manifest.key, "base64"))
  .digest("hex")
  .slice(0, 32);
const id = [...digest]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
console.log(`Companion extension ID: ${id}`);
