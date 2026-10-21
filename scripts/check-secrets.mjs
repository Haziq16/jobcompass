import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Scan the Git index. Findings contain file paths and categories, never values.
const git = (args) =>
  execFileSync(
    "git",
    ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, ...args],
    { encoding: "utf8", maxBuffer: 10000000 },
  );
const paths = git(["ls-files", "-z"]).split("\0").filter(Boolean);
if (!paths.length)
  throw new Error(
    "No tracked files to scan. Stage the intended source files first.",
  );
const known = new Set();
for (const file of [".env", ".env.local", ".env.hosted", ".env.catalog.local"]) {
  if (!existsSync(file)) continue;
  const values = parseEnv(readFileSync(file, "utf8"));
  for (const [name, value] of Object.entries(values)) {
    if (
      !/KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL/i.test(name) ||
      value.length < 12
    )
      continue;
    if (/^postgres(?:ql)?:\/\//.test(value)) {
      const url = new URL(value);
      if (["localhost", "127.0.0.1"].includes(url.hostname)) continue;
      if (url.password.length >= 8) known.add(decodeURIComponent(url.password));
    }
    known.add(value);
  }
}
if (existsSync(".owner-login.txt")) {
  const value = readFileSync(".owner-login.txt", "utf8")
    .match(/^Initial password: (.+)$/m)?.[1]
    ?.trim();
  if (value && value.length >= 8) known.add(value);
}
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    "GitHub token",
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  ],
  ["provider secret", /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{30,}\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  [
    "remote database credential",
    /postgres(?:ql)?:\/\/[^\s:"']+:[^\s@"']+@(?!(?:127\.0\.0\.1|localhost)(?::|\/))/,
  ],
];
const findings = [];
for (const path of paths) {
  if (
    (/^\.env/.test(path) && path !== ".env.example") ||
    /^(?:research|test-results|\.postgres|\.vercel|\.release-backup|\.auth)\//.test(
      path,
    ) ||
    /(?:\.log$|\.owner-login|\.pem$|\.p12$|\.pfx$)/.test(path)
  ) {
    findings.push({ path, category: "private/generated file" });
    continue;
  }
  if (/\.(?:png|jpg|jpeg|webp|ico|woff2?)$/i.test(path)) continue;
  const content = git(["show", `:${path}`]);
  if ([...known].some((value) => content.includes(value)))
    findings.push({ path, category: "matches a local secret" });
  for (const [category, pattern] of patterns)
    if (pattern.test(content)) findings.push({ path, category });
}
if (findings.length) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exitCode = 1;
} else
  console.log(
    JSON.stringify({
      status: "passed",
      trackedFiles: paths.length,
      knownLocalSecretComparison: known.size > 0,
      secretValuesPrinted: false,
    }),
  );
