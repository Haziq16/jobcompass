import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { authDb, db } from "../src/lib/db";
import { inWorkspace } from "../src/lib/workspace-context";
import { parseCatalog, type PublicJob } from "../src/lib/catalog-provider";
import {
  seedCatalog,
  publishCatalogBoard,
  listCatalog,
  refreshCatalog,
} from "../src/lib/catalog";
import {
  catalogBudget,
  catalogCapacity,
  pruneCatalog,
  referencedCatalogIds,
} from "../src/lib/catalog-retention";
import { errorCode, isStorageFull } from "../src/lib/db-errors";
import { apiError } from "../src/lib/http";

if (
  process.env.JOBCOMPASS_TEST !== "true" ||
  !process.env.DATABASE_URL?.includes("/jobcompass_test")
)
  throw new Error("Test database only");

// Fictional public-board fixtures only.
const board = {
  id: "greenhouse:retention-fixture",
  platform: "greenhouse" as const,
  token: "retention-fixture",
  name: "Retention Fixture Co",
};
const day = 86_400_000;
const base = Date.parse("2026-11-01T00:00:00Z");
function jobs(
  count: number,
  offset = 0,
  content = "Build services with TypeScript",
): PublicJob[] {
  return parseCatalog(
    {
      jobs: Array.from({ length: count }, (_, i) => ({
        id: offset + i + 1,
        title: `Engineer ${offset + i + 1}`,
        absolute_url: `https://jobs.example.test/${offset + i + 1}`,
        location: { name: "London, UK" },
        content,
        updated_at: new Date(base).toISOString(),
      })),
    },
    board,
  ).map((job, i) => ({
    ...job,
    // Newer postings have larger numbers.
    publishedAt: new Date(base + (offset + i) * day).toISOString(),
  }));
}
const envNames = [
  "CATALOG_DATABASE_BUDGET_MB",
  "CATALOG_MAX_JOBS",
  "CATALOG_MAX_JOBS_PER_BOARD",
];
const saved = Object.fromEntries(envNames.map((n) => [n, process.env[n]]));
beforeEach(async () => {
  process.env.APP_ACCESS = "local";
  for (const n of envNames) delete process.env[n];
  await authDb.$executeRawUnsafe(
    'TRUNCATE TABLE "CatalogBoard", "CatalogJob", "CatalogSync", "MatchDecision", "Job", "AiReview", "Profile", "Settings" CASCADE',
  );
  await seedCatalog();
  await authDb.catalogBoard.updateMany({ data: { enabled: false } });
  await authDb.catalogBoard.create({
    data: { ...board, lastSuccessAt: new Date() },
  });
});
after(async () => {
  for (const n of envNames)
    if (saved[n] === undefined) delete process.env[n];
    else process.env[n] = saved[n];
  await db.$disconnect();
});
const activeIds = async () =>
  (
    await authDb.catalogJob.findMany({
      where: { active: true },
      select: { id: true },
      orderBy: { publishedAt: "desc" },
    })
  ).map((j) => j.id);
async function queue(job: PublicJob, workspace = "alice") {
  await inWorkspace(workspace, () =>
    db.matchDecision.create({
      data: {
        workspaceId: workspace,
        catalogId: job.id,
        providerId: job.providerId,
        applyUrl: job.applyUrl,
        state: "queued",
        snapshot: { title: job.title, employer: job.employer },
      },
    }),
  );
}
async function userCounts() {
  const [decisions, sources, reviews, jobsCount] = await Promise.all([
    authDb.matchDecision.count(),
    authDb.jobSource.count(),
    authDb.aiReview.count(),
    authDb.job.count(),
  ]);
  return { decisions, sources, reviews, jobs: jobsCount };
}

test("search text is no longer stored, yet search and skill keys still cover the description", async () => {
  const deep =
    "Collaborate on distributed systems. ".repeat(80) +
    "Experience with Rust is essential.";
  const [job] = jobs(1, 0, deep);
  await publishCatalogBoard(board.id, [job]);
  const stored = await authDb.catalogJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(stored.searchText, "");
  assert.ok(stored.skillKeys.includes("rust"));
  assert.ok(deep.indexOf("Rust") > 2000);
  const found = await inWorkspace("alice", () =>
    listCatalog(new URLSearchParams("q=rust")),
  );
  assert.deepEqual(
    found.jobs.map((j) => j.id),
    [job.id],
  );
  assert.ok(!("description" in found.jobs[0]));
});

test("descriptions are capped at 20,000 characters", () => {
  const [job] = jobs(1, 0, "x".repeat(25_000));
  assert.equal(job.description?.length, 20_000);
});

test("the per-board cap keeps the newest postings plus any job a user refers to", async () => {
  const feed = jobs(12);
  await queue(feed[0]); // the oldest posting is queued by a user
  const result = await publishCatalogBoard(
    board.id,
    feed,
    undefined,
    undefined,
    {
      perBoardCap: 5,
    },
  );
  const ids = await activeIds();
  assert.equal(result.stored, 6);
  assert.deepEqual(
    ids.slice(0, 5),
    feed
      .slice(-5)
      .reverse()
      .map((j) => j.id),
  );
  assert.ok(ids.includes(feed[0].id));
  assert.equal(
    (await referencedCatalogIds(feed)).size,
    1,
    "references are found before the job is stored",
  );
});

test("with no capacity, existing jobs update, new jobs are skipped and validators are cleared", async () => {
  const first = jobs(2);
  await publishCatalogBoard(board.id, first);
  for (const job of first) await queue(job);
  process.env.CATALOG_MAX_JOBS = "1";
  assert.equal((await catalogCapacity()).insertsAllowed, false);
  await authDb.catalogBoard.update({
    where: { id: board.id },
    data: { etag: '"old-tag"', nextFetchAt: new Date(0) },
  });
  const nextIds = [1, 2, 11];
  const result = await refreshCatalog(async () =>
    Response.json({
      jobs: nextIds.map((id) => ({
        id,
        title: id === 1 ? "Engineer 1 (updated)" : `Engineer ${id}`,
        absolute_url: `https://jobs.example.test/${id}`,
        location: { name: "London, UK" },
        content: "Build services with TypeScript",
        updated_at: new Date(base).toISOString(),
      })),
    }),
  );
  const refreshed = result as typeof result & {
    storage: { insertsPaused: boolean };
  };
  assert.equal(refreshed.succeeded, 1);
  assert.equal(refreshed.storage.insertsPaused, true);
  assert.equal(await authDb.catalogJob.count(), 2);
  assert.equal(
    (await authDb.catalogJob.findUniqueOrThrow({ where: { id: first[0].id } }))
      .title,
    "Engineer 1 (updated)",
  );
  const saved = await authDb.catalogBoard.findUniqueOrThrow({
    where: { id: board.id },
  });
  assert.equal(saved.etag, null);
  assert.equal(saved.error, "catalog_budget_reached");
});

test("retention deletes retired and stale jobs in batches but never referenced ones or user rows", async () => {
  const feed = jobs(30);
  await publishCatalogBoard(board.id, feed);
  // Retire 20 jobs: they left the employer's feed.
  await publishCatalogBoard(board.id, feed.slice(20));
  const retired = feed.slice(0, 20);
  await queue(retired[0]);
  await inWorkspace("alice", async () => {
    const saved = await db.job.create({
      data: {
        title: "Saved copy",
        employer: "Retention Fixture Co",
        relatedFingerprint: randomUUID(),
      },
    });
    await db.jobSource.create({
      data: {
        jobId: saved.id,
        providerId: retired[1].providerId,
        applyLinks: [],
      },
    });
    await db.aiReview.create({
      data: {
        requestKey: randomUUID(),
        fingerprint: "fixture",
        provider: "openai",
        model: "fixture-model",
        jobSnapshot: {
          source: "catalog",
          id: retired[2].id,
          title: "x",
          employer: "y",
        },
        resumeSnapshot: "Jordan Ellis",
        checks: {},
      },
    });
  });
  const before = await userCounts();
  const pruned = await pruneCatalog({ batchSize: 4 });
  assert.equal(pruned.retired, 17);
  const left = await authDb.catalogJob.findMany({
    select: { id: true, active: true },
  });
  assert.equal(left.filter((j) => j.active).length, 10);
  assert.deepEqual(
    left
      .filter((j) => !j.active)
      .map((j) => j.id)
      .sort(),
    [retired[0].id, retired[1].id, retired[2].id].sort(),
  );
  assert.deepEqual(await userCounts(), before);
  // A feed unconfirmed for over 14 days is treated as stale.
  await authDb.catalogBoard.update({
    where: { id: board.id },
    data: { lastSuccessAt: new Date(Date.now() - 15 * day) },
  });
  const stale = await pruneCatalog();
  assert.equal(stale.retired, 10);
  assert.equal(await authDb.catalogJob.count(), 3);
  assert.deepEqual(await userCounts(), before);
});

test("global and per-board overflow remove the oldest postings first", async () => {
  await publishCatalogBoard(board.id, jobs(16), undefined, undefined, {
    perBoardCap: 100,
  });
  process.env.CATALOG_MAX_JOBS_PER_BOARD = "12";
  const perBoard = await pruneCatalog();
  assert.equal(perBoard.boardOverflow, 4);
  process.env.CATALOG_MAX_JOBS = "5";
  const global = await pruneCatalog();
  assert.equal(global.globalOverflow, 7);
  assert.deepEqual(
    await activeIds(),
    jobs(16)
      .slice(-5)
      .reverse()
      .map((j) => j.id),
  );
});

test("the budget derives a job cap from CATALOG_DATABASE_BUDGET_MB", () => {
  process.env.CATALOG_DATABASE_BUDGET_MB = "450";
  const budget = catalogBudget();
  assert.equal(budget.budgetBytes, 450 * 1024 * 1024);
  assert.ok(budget.maxJobs > 60_000 && budget.maxJobs < 70_000);
  assert.equal(budget.perBoardCap, 500);
  process.env.CATALOG_DATABASE_BUDGET_MB = "5000";
  assert.equal(catalogBudget().budgetBytes, 750 * 1024 * 1024);
});

test("storage-full errors get their own code and only codes are logged", async () => {
  const full = {
    code: "P2010",
    meta: { code: "53100", message: "could not extend file: secret row text" },
  };
  assert.equal(isStorageFull(full), true);
  assert.equal(
    isStorageFull({
      message: "project size limit (1024 MB) has been exceeded",
    }),
    true,
  );
  assert.equal(isStorageFull({ code: "P1001" }), false);
  assert.equal(errorCode(full), "database_storage_full");
  assert.equal(
    errorCode({ code: "P2002", meta: { code: "23505" } }),
    "P2002:23505",
  );
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    const response = apiError(full);
    assert.equal(response.status, 507);
    assert.deepEqual(await response.json(), { error: "database_storage_full" });
    assert.equal(apiError({ code: "P1001" }).status, 503);
  } finally {
    console.error = original;
  }
  assert.ok(!JSON.stringify(logged).includes("secret row text"));
});
