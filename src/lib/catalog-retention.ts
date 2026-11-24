import { Prisma } from "@prisma/client";
import { authDb } from "./db";

/*
 * Keeps the public catalogue inside its storage budget.
 *
 * - Capacity: inserts of new jobs stop when the database file or the job-count
 *   cap is reached. Existing jobs can still be updated or retired.
 * - Retention: retired jobs, jobs on feeds unconfirmed for 14 days, per-board
 *   overflow and global overflow are deleted in small batches, oldest first.
 * - Nothing that a user-owned row refers to is ever deleted, and no user table
 *   is ever written here.
 */

const MB = 1024 * 1024;
// Measured on production data: about 5.3 KB per job with the compact layout.
// 7 KB leaves room for dead rows between vacuums.
const PLANNED_BYTES_PER_JOB = 7000;
// User data, boards and indexes outside CatalogJob.
const RESERVED_MB = 25;
export const STALE_FEED_DAYS = 14;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const envNumber = (name: string) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

export function catalogBudget() {
  const budgetMb = clamp(
    envNumber("CATALOG_DATABASE_BUDGET_MB") ?? 750,
    32,
    750,
  );
  const derivedJobs = Math.floor(
    (Math.max(0, budgetMb - RESERVED_MB) * MB) / PLANNED_BYTES_PER_JOB,
  );
  return {
    budgetBytes: budgetMb * MB,
    maxJobs: clamp(envNumber("CATALOG_MAX_JOBS") ?? derivedJobs, 0, 1_000_000),
    perBoardCap: clamp(
      envNumber("CATALOG_MAX_JOBS_PER_BOARD") ?? 500,
      10,
      10_000,
    ),
  };
}

export async function catalogCapacity() {
  const budget = catalogBudget();
  const [{ bytes, active }] = await authDb.$queryRaw<
    { bytes: bigint; active: number }[]
  >`SELECT pg_database_size(current_database()) AS bytes,
      (SELECT COUNT(*)::int FROM "CatalogJob" WHERE active) AS active`;
  const usedBytes = Number(bytes);
  const underCount = active < budget.maxJobs * 1.05;
  // Over the file budget, refill only while well below the job cap: deleted
  // rows leave reusable space, so the file does not need to grow.
  const fileRoom =
    usedBytes + 8 * MB < budget.budgetBytes || active < budget.maxJobs * 0.85;
  return {
    ...budget,
    usedBytes,
    activeJobs: active,
    insertsAllowed: underCount && fileRoom,
  };
}

// A catalogue job is protected while any user-owned row points at it.
const unreferenced = Prisma.sql`
  NOT EXISTS (SELECT 1 FROM "MatchDecision" d WHERE d."catalogId" = j.id OR d."providerId" = j."providerId")
  AND NOT EXISTS (SELECT 1 FROM "ApplicationAnswer" a WHERE a."catalogId" = j.id)
  AND NOT EXISTS (SELECT 1 FROM "ApplicationQuestion" q WHERE q."catalogId" = j.id)
  AND NOT EXISTS (SELECT 1 FROM "ApplicationFillSession" f WHERE f."catalogId" = j.id)
  AND NOT EXISTS (SELECT 1 FROM "JobSource" s WHERE s."providerId" = j."providerId")
  AND NOT EXISTS (SELECT 1 FROM "AiReview" r WHERE r."jobSnapshot"->>'source' = 'catalog' AND r."jobSnapshot"->>'id' = j.id)`;

/** IDs (from a feed snapshot) that a user-owned row refers to. Checks the user
 * tables directly, so it also works for jobs not stored in the catalogue yet. */
export async function referencedCatalogIds(
  jobs: { id: string; providerId: string }[],
) {
  if (!jobs.length) return new Set<string>();
  const rows = await authDb.$queryRaw<{ id: string }[]>`
    SELECT j.id FROM unnest(${jobs.map((x) => x.id)}::text[], ${jobs.map((x) => x.providerId)}::text[]) AS j(id, "providerId")
    WHERE NOT (${unreferenced})`;
  return new Set(rows.map((r) => r.id));
}
async function deleteBatch(candidates: Prisma.Sql) {
  return authDb.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '30s'`;
    return tx.$executeRaw`DELETE FROM "CatalogJob" WHERE id IN (${candidates})`;
  });
}

export async function pruneCatalog(
  options: { batchSize?: number; deadline?: number; now?: Date } = {},
) {
  const batch = clamp(options.batchSize ?? 1000, 1, 5000);
  const deadline = options.deadline ?? Date.now() + 20_000;
  const staleBefore = new Date(
    (options.now ?? new Date()).valueOf() - STALE_FEED_DAYS * 86_400_000,
  );
  const { perBoardCap, maxJobs } = catalogBudget();
  const result = { retired: 0, boardOverflow: 0, globalOverflow: 0 };
  const run = async (key: keyof typeof result, select: () => Prisma.Sql) => {
    while (Date.now() < deadline) {
      const removed = await deleteBatch(select());
      result[key] += removed;
      if (removed < batch) break;
    }
  };
  // 1. Retired jobs and jobs whose feed has not been confirmed for 14 days.
  await run(
    "retired",
    () => Prisma.sql`
      SELECT j.id FROM "CatalogJob" j JOIN "CatalogBoard" b ON b.id = j."boardId"
      WHERE (NOT j.active OR NOT b.enabled OR b."lastSuccessAt" IS NULL OR b."lastSuccessAt" < ${staleBefore.toISOString()}::timestamp)
        AND ${unreferenced}
      LIMIT ${batch}`,
  );
  // 2. Per-board overflow: keep each board's newest postings.
  await run(
    "boardOverflow",
    () => Prisma.sql`
      SELECT j.id FROM (
        SELECT id, row_number() OVER (PARTITION BY "boardId" ORDER BY COALESCE("publishedAt", "firstSeen") DESC, id) AS rank
        FROM "CatalogJob" WHERE active
      ) ranked JOIN "CatalogJob" j ON j.id = ranked.id
      WHERE ranked.rank > ${perBoardCap} AND ${unreferenced}
      LIMIT ${batch}`,
  );
  // 3. Global overflow: keep the newest postings overall.
  const [{ active }] = await authDb.$queryRaw<{ active: number }[]>`
    SELECT COUNT(*)::int AS active FROM "CatalogJob" WHERE active`;
  let excess = active - maxJobs;
  while (excess > 0 && Date.now() < deadline) {
    const limit = Math.min(batch, excess);
    const removed = await deleteBatch(Prisma.sql`
      SELECT j.id FROM "CatalogJob" j WHERE j.active AND ${unreferenced}
      ORDER BY COALESCE(j."publishedAt", j."firstSeen") ASC, j.id LIMIT ${limit}`);
    result.globalOverflow += removed;
    excess -= removed;
    if (removed < limit) break;
  }
  const total = result.retired + result.boardOverflow + result.globalOverflow;
  // Make freed space reusable promptly so refills do not grow the file.
  if (total > 0)
    await authDb
      .$executeRawUnsafe('VACUUM (ANALYZE) "CatalogJob"')
      .catch(() => console.error("catalog_vacuum_failed"));
  return { ...result, total };
}
