import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
const source = new URL(process.env.DATABASE_URL);
const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";
const db = new PrismaClient({ datasourceUrl: adminUrl.toString() });
const found =
  await db.$queryRaw`SELECT 1 FROM pg_database WHERE datname='jobcompass_test'`;
if (!found.length)
  await db.$executeRawUnsafe(
    "CREATE DATABASE jobcompass_test ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'",
  );
await db.$disconnect();
source.pathname = "/jobcompass_test";
const env = {
  ...process.env,
  DATABASE_URL: source.toString(),
  JOBCOMPASS_TEST: "true",
  PUBLIC_SIGNUP: "false",
  ENABLE_AI: "false",
  JSEARCH_API_KEY: "",
  JSEARCH_PLAN_CONFIRMED: "false",
  AI_GATEWAY_API_KEY: "",
  AI_GATEWAY_MODEL: "",
  PERSONAL_AI_ENCRYPTION_KEY: "11".repeat(32),
};
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env, stdio: "inherit" },
);
execFileSync(
  process.execPath,
  [
    "--import=tsx",
    "--test",
    "--test-concurrency=1",
    "tests/core.test.ts",
    "tests/upgrade.test.ts",
    "tests/direct.test.ts",
    "tests/accounts.test.ts",
    "tests/catalog.test.ts",
    "tests/personal-ai.test.ts",
    "tests/cv-personalization.test.ts",
  ],
  { env, stdio: "inherit" },
);
