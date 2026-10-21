import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdirSync, copyFileSync, readdirSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";
const source = new URL(process.env.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(source.hostname))
  throw new Error("Migration verification is local-only.");
const name = `jobcompass_migration_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";
const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
const target = new URL(source);
target.pathname = "/" + name;
const db = new PrismaClient({ datasourceUrl: target.toString() });
const root = path.resolve("test-results/migration");
mkdirSync(path.join(root, "migrations"), { recursive: true });
copyFileSync("prisma/schema.prisma", path.join(root, "schema.prisma"));
copyFileSync(
  "prisma/migrations/migration_lock.toml",
  path.join(root, "migrations/migration_lock.toml"),
);
const prior = readdirSync("prisma/migrations").filter((n) =>
  /^20261020000[123]_/.test(n),
);
for (const dir of prior)
  cpSync(
    path.join("prisma/migrations", dir),
    path.join(root, "migrations", dir),
    { recursive: true },
  );
const env = { ...process.env, DATABASE_URL: target.toString() };
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  execFileSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--schema",
      path.join(root, "schema.prisma"),
    ],
    { env, stdio: "pipe" },
  );
  await db.$executeRaw`INSERT INTO "Job" (id,title,employer,"relatedFingerprint","lastFetched") VALUES ('legacy-job','Legacy role','Legacy employer','legacy',NOW())`;
  await db.$executeRaw`INSERT INTO "Application" (id,"jobId",status,notes,"updatedAt") VALUES ('legacy-app','legacy-job','Interview','Preserve these notes',NOW())`;
  await db.$executeRaw`INSERT INTO "ApplicationEvent" (id,"applicationId",status) VALUES ('legacy-event','legacy-app','Interview')`;
  await db.$executeRaw`INSERT INTO "User" (id,name,email,"emailVerified","updatedAt") VALUES ('legacy-owner','Original owner','owner@migration.example',true,NOW())`;
  await db.$executeRaw`INSERT INTO "Profile" (id,skills,"updatedAt") VALUES ('owner',ARRAY['Legacy skill'],NOW())`;
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env, stdio: "pipe" },
  );
  const app = await db.application.findUniqueOrThrow({
    where: { id: "legacy-app" },
    include: { events: true },
  });
  assert.equal(app.notes, "Preserve these notes");
  assert.equal(app.status, "Interview");
  assert.equal(app.events[0].id, "legacy-event");
  assert.equal(app.events[0].kind, "status");
  assert.equal(app.preparationState, "not_started");
  assert.equal(app.workspaceId, "legacy-owner");
  const originalProfile = await db.profile.findUniqueOrThrow({
    where: { id: "legacy-owner" },
  });
  assert.deepEqual(originalProfile.skills, ["Legacy skill"]);
  assert.equal(originalProfile.workspaceId, "legacy-owner");
  await db.apiRequestLedger.create({
    data: {
      fingerprint: "direct:fixture",
      cycleId: "fixture",
      dayKey: "fixture",
      units: 0,
    },
  });
  await assert.rejects(
    db.apiRequestLedger.create({
      data: {
        fingerprint: "paid-fixture",
        cycleId: "fixture",
        dayKey: "fixture",
        units: 0,
      },
    }),
  );
  console.log(
    "PASS: all prior migrations → upgrade; legacy status, notes and event preserved.",
  );
} finally {
  await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.$disconnect();
}
