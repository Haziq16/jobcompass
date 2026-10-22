import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { authDb, db } from "./db";
import { catalogBoards, type CatalogPlatform } from "./catalog-boards";
import { fetchCatalogBoard, type PublicJob } from "./catalog-provider";
import { AppError, normalizedUrl } from "./contracts";
import { workspaceId } from "./workspace-context";
import { lock } from "./discovery";
import { hasTerm } from "./matching";
import {
  recommendationProfile,
  recommendationSql,
  recommendationReasons,
  smartQuery,
} from "./job-recommendations";

export const CATALOG_INTERVAL_MS = 5 * 60_000;
const originalBoards = new Set(catalogBoards.map(([p, t]) => `${p}:${t}`));
function refreshInterval(id: string, jobs: number) {
  return jobs === 0
    ? 86400000
    : originalBoards.has(id)
      ? CATALOG_INTERVAL_MS
      : 30 * 60000;
}
export async function seedCatalog() {
  await authDb.catalogBoard.createMany({
    data: catalogBoards.map(([platform, token, name]) => ({
      id: `${platform}:${token}`,
      platform,
      token,
      name,
    })),
    skipDuplicates: true,
  });
}

/** Publish a complete, validated snapshot atomically. Failed fetches never close jobs. */
export async function publishCatalogBoard(
  boardId: string,
  jobs: PublicJob[],
  now = new Date(),
  admission?: {
    activate: boolean;
    etag: string | null;
    modified: string | null;
  },
) {
  return authDb.$transaction(
    async (tx) => {
      const board = await tx.catalogBoard.findUniqueOrThrow({
        where: { id: boardId },
      });
      const baseline = Boolean(board.initialIndexedAt);
      for (let start = 0; start < jobs.length; start += 100) {
        const json = JSON.stringify(jobs.slice(start, start + 100));
        await tx.$executeRaw`
        INSERT INTO "CatalogJob" (
          "id","boardId","providerId","title","employer","location","country","remote",
          "employmentType","department","description","salaryText","sourceUrl","applyUrl",
          "publishedAt","firstSeen","lastChangedAt","discoveredAfterBaseline","active","hash","searchText"
        ) SELECT j.id,${boardId},j."providerId",j.title,j.employer,j.location,j.country,j.remote,
          j."employmentType",j.department,j.description,j."salaryText",j."sourceUrl",j."applyUrl",
          j."publishedAt",${now.toISOString()}::timestamp,${now.toISOString()}::timestamp,${baseline},true,j.hash,j."searchText"
        FROM jsonb_to_recordset(${json}::jsonb) AS j(
          id text,"providerId" text,title text,employer text,location text,country text,remote boolean,
          "employmentType" text,department text,description text,"salaryText" text,"sourceUrl" text,
          "applyUrl" text,"publishedAt" timestamp,hash text,"searchText" text
        ) ON CONFLICT ("id") DO UPDATE SET
          "title"=EXCLUDED."title","employer"=EXCLUDED."employer","location"=EXCLUDED."location",
          "country"=EXCLUDED."country","remote"=EXCLUDED."remote","employmentType"=EXCLUDED."employmentType",
          "department"=EXCLUDED."department","description"=EXCLUDED."description","salaryText"=EXCLUDED."salaryText",
          "sourceUrl"=EXCLUDED."sourceUrl","applyUrl"=EXCLUDED."applyUrl","publishedAt"=EXCLUDED."publishedAt",
          "lastChangedAt"=EXCLUDED."lastChangedAt","active"=true,"hash"=EXCLUDED."hash","searchText"=EXCLUDED."searchText"
        WHERE "CatalogJob"."hash" IS DISTINCT FROM EXCLUDED."hash" OR NOT "CatalogJob"."active"
      `;
      }
      await tx.catalogJob.updateMany({
        where: { boardId, active: true, id: { notIn: jobs.map((j) => j.id) } },
        data: { active: false, lastChangedAt: now },
      });
      await tx.catalogBoard.update({
        where: { id: boardId },
        data: {
          jobCount: jobs.length,
          initialIndexedAt: board.initialIndexedAt || now,
          lastSuccessAt: now,
          nextFetchAt: new Date(
            now.valueOf() + refreshInterval(board.id, jobs.length),
          ),
          ...(admission
            ? {
                enabled: admission.activate,
                etag: admission.etag,
                modified: admission.modified,
              }
            : {}),
          failures: 0,
          error: null,
        },
      });
      return jobs.length;
    },
    { timeout: 90_000, maxWait: 10_000 },
  );
}

export async function refreshCatalog(request: typeof fetch = fetch) {
  await seedCatalog();
  await authDb.catalogSync.createMany({
    data: [{ id: "global" }],
    skipDuplicates: true,
  });
  const now = new Date();
  const lease = await authDb.catalogSync.updateMany({
    where: { id: "global", leaseUntil: { lte: now }, nextRunAt: { lte: now } },
    data: {
      leaseUntil: new Date(now.valueOf() + 300_000),
      nextRunAt: new Date(now.valueOf() + CATALOG_INTERVAL_MS),
      startedAt: now,
    },
  });
  if (!lease.count)
    return {
      status: "already_current" as const,
      checked: 0,
      succeeded: 0,
      failed: 0,
    };
  let checked = 0,
    succeeded = 0,
    failed = 0;
  try {
    const pending = await authDb.catalogBoard.findMany({
      where: { enabled: true, nextFetchAt: { lte: now } },
      orderBy: [{ nextFetchAt: "asc" }, { id: "asc" }],
      take: 120,
    });
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (;;) {
          // Leave time for the current fetch and database transaction before expiry.
          if (Date.now() - now.valueOf() > 160_000) break;
          const board = pending.shift();
          if (!board) break;
          checked++;
          await authDb.catalogBoard.update({
            where: { id: board.id },
            data: { lastAttemptAt: new Date() },
          });
          try {
            const result = await fetchCatalogBoard(
              {
                platform: board.platform as CatalogPlatform,
                token: board.token,
                name: board.name,
                etag: board.etag,
                modified: board.modified,
              },
              request,
            );
            if (result.unchanged) {
              if (!board.initialIndexedAt)
                throw new AppError("unexpected_not_modified", 502);
              await authDb.catalogBoard.update({
                where: { id: board.id },
                data: {
                  lastSuccessAt: new Date(),
                  nextFetchAt: new Date(
                    Date.now() + refreshInterval(board.id, board.jobCount),
                  ),
                  failures: 0,
                  error: null,
                },
              });
            } else {
              await publishCatalogBoard(board.id, result.jobs);
              await authDb.catalogBoard.update({
                where: { id: board.id },
                data: { etag: result.etag, modified: result.modified },
              });
            }
            succeeded++;
          } catch (error) {
            failed++;
            const backoff = Math.min(
              360,
              30 * 2 ** Math.min(board.failures, 4),
            );
            await authDb.catalogBoard.update({
              where: { id: board.id },
              data: {
                failures: { increment: 1 },
                error:
                  error instanceof AppError ? error.code : "source_unavailable",
                nextFetchAt: new Date(Date.now() + backoff * 60_000),
              },
            });
          }
        }
      }),
    );
  } finally {
    await authDb.catalogSync.update({
      where: { id: "global" },
      data: { leaseUntil: new Date(), finishedAt: new Date() },
    });
  }
  return { status: "completed" as const, checked, succeeded, failed };
}

export function catalogFilters(params: URLSearchParams) {
  const q = (params.get("q") || "").trim().slice(0, 200);
  const location = (params.get("location") || "").trim().slice(0, 120);
  const employer = (params.get("employer") || "").slice(0, 120);
  const platform = params.get("platform");
  const since = params.get("since");
  const clauses = [
    Prisma.sql`j.active=true`,
    Prisma.sql`b.enabled=true`,
    Prisma.sql`b."lastSuccessAt">(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')-INTERVAL '48 hours'`,
  ];
  if (q)
    clauses.push(
      Prisma.sql`to_tsvector('simple',j."searchText") @@ websearch_to_tsquery('simple',${smartQuery(q)})`,
    );
  for (const [term, pattern] of [
    ["C++", "(^|[^a-z0-9])c\\+\\+($|[^a-z0-9])"],
    ["C#", "(^|[^a-z0-9])c#($|[^a-z0-9])"],
    [".NET", "(^|[^a-z0-9])\\.net($|[^a-z0-9])"],
  ])
    if (!/["|():]|\bOR\b|(?:^|\s)-\w/.test(q) && hasTerm(q, term))
      clauses.push(Prisma.sql`j."searchText" ~* ${pattern}`);
  if (location)
    clauses.push(
      Prisma.sql`j.location ILIKE ${"%" + location.replace(/[\\%_]/g, "\\$&") + "%"}`,
    );
  if (employer) clauses.push(Prisma.sql`j.employer=${employer}`);
  if (params.get("remote") === "true") clauses.push(Prisma.sql`j.remote=true`);
  if (
    [
      "greenhouse",
      "lever",
      "lever-eu",
      "ashby",
      "workable",
      "recruitee",
    ].includes(platform || "")
  )
    clauses.push(Prisma.sql`b.platform=${platform}`);
  const hours =
    since === "1h" ? 1 : since === "24h" ? 24 : since === "7d" ? 168 : 0;
  if (hours) {
    const cutoff = new Date(Date.now() - hours * 3600_000);
    clauses.push(
      params.get("freshness") === "found"
        ? Prisma.sql`j."discoveredAfterBaseline"=true AND j."firstSeen">=${cutoff.toISOString()}::timestamp`
        : Prisma.sql`j."publishedAt">=${cutoff.toISOString()}::timestamp`,
    );
  }
  return Prisma.sql`${Prisma.join(clauses, " AND ")}`;
}
export async function listCatalog(params: URLSearchParams) {
  const where = catalogFilters(params);
  const personalization = await recommendationProfile();
  const useProfile = params.get("forYou") === "true";
  const query = (params.get("q") || "").trim().slice(0, 200);
  const relevance = Prisma.sql`ts_rank_cd(setweight(to_tsvector('simple',j.title),'A') || setweight(to_tsvector('simple',j.employer),'B') || setweight(to_tsvector('simple',j."searchText"),'D'),websearch_to_tsquery('simple',${smartQuery(query)}))`;
  const requested = Number(params.get("page"));
  const page =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, 10000)
      : 1;
  const dateOrder =
    params.get("sort") === "found"
      ? Prisma.sql`j."firstSeen" DESC,j.id`
      : Prisma.sql`COALESCE(j."publishedAt",CASE WHEN j."discoveredAfterBaseline" THEN j."firstSeen" END) DESC NULLS LAST,j."firstSeen" DESC,j.id`;
  const order = useProfile
    ? Prisma.sql`${recommendationSql(personalization)} DESC,${dateOrder}`
    : query && (!params.get("sort") || params.get("sort") === "relevance")
      ? Prisma.sql`${relevance} DESC,${dateOrder}`
      : dateOrder;
  const [ids, count, boards, sync] = await Promise.all([
    authDb.$queryRaw<
      { id: string }[]
    >`SELECT j.id FROM "CatalogJob" j JOIN "CatalogBoard" b ON b.id=j."boardId" WHERE ${where} ORDER BY ${order} LIMIT 30 OFFSET ${(page - 1) * 30}`,
    authDb.$queryRaw<
      { count: number }[]
    >`SELECT COUNT(*)::int AS count FROM "CatalogJob" j JOIN "CatalogBoard" b ON b.id=j."boardId" WHERE ${where}`,
    authDb.catalogBoard.findMany({
      where: { enabled: true },
      select: {
        id: true,
        name: true,
        platform: true,
        jobCount: true,
        lastSuccessAt: true,
        error: true,
      },
      orderBy: { name: "asc" },
    }),
    authDb.catalogSync.findUnique({
      where: { id: "global" },
      select: { startedAt: true, finishedAt: true, leaseUntil: true },
    }),
  ]);
  const rows = await authDb.catalogJob.findMany({
    where: { id: { in: ids.map((j) => j.id) } },
    select: {
      id: true,
      providerId: true,
      searchText: true,
      title: true,
      employer: true,
      location: true,
      remote: true,
      employmentType: true,
      salaryText: true,
      publishedAt: true,
      firstSeen: true,
      discoveredAfterBaseline: true,
      sourceUrl: true,
      applyUrl: true,
      board: { select: { platform: true, lastSuccessAt: true } },
    },
  });
  const personal = await db.jobSource.findMany({
    where: { providerId: { in: rows.map((j) => j.providerId) } },
    select: {
      providerId: true,
      job: { select: { id: true, saved: { select: { jobId: true } } } },
    },
  });
  const personalById = new Map(personal.map((s) => [s.providerId, s.job]));
  const rowsById = new Map(rows.map((j) => [j.id, j]));
  const total = count[0].count;
  const recentCutoff = Date.now() - 48 * 3600_000;
  const healthy = boards.filter(
    (b) => b.lastSuccessAt && b.lastSuccessAt.valueOf() > recentCutoff,
  );
  return {
    jobs: ids.map(({ id }) => {
      const j = rowsById.get(id)!;
      const p = personalById.get(j.providerId);
      const { searchText, ...listing } = j;
      return {
        ...listing,
        recommendation: recommendationReasons(
          { ...j, searchText },
          personalization,
        ),
        personalJobId: p?.id || null,
        saved: Boolean(p?.saved),
      };
    }),
    total,
    personalization: {
      active: useProfile,
      hasSignals: Boolean(
        personalization.titles.length || personalization.skills.length,
      ),
      ...personalization,
    },
    page,
    pages: Math.ceil(total / 30),
    stats: {
      total: healthy.reduce((n, b) => n + b.jobCount, 0),
      companies: healthy.length,
      configured: boards.length,
      failed: boards.filter((b) => b.error).length,
      lastFinishedAt: sync?.finishedAt || null,
      refreshing: Boolean(sync && sync.leaseUntil > new Date()),
    },
    employers: healthy.map((b) => b.name),
  };
}

export async function saveCatalogJob(id: string) {
  const publicJob = await authDb.catalogJob.findUnique({
    where: { id },
    include: { board: true },
  });
  if (
    !publicJob ||
    !publicJob.active ||
    !publicJob.board.enabled ||
    !publicJob.board.lastSuccessAt ||
    publicJob.board.lastSuccessAt.valueOf() < Date.now() - 48 * 3600_000
  )
    throw new AppError("listing_unavailable", 404);
  return db.$transaction(
    async (tx) => {
      await lock(tx);
      const source = await tx.jobSource.findUnique({
        where: {
          workspaceId_providerId: {
            workspaceId: workspaceId(),
            providerId: publicJob.providerId,
          },
        },
      });
      const jobId =
        source?.jobId ||
        (
          await tx.job.create({
            data: {
              title: publicJob.title,
              employer: publicJob.employer,
              location: publicJob.location,
              country: publicJob.country,
              description: publicJob.description,
              remote: publicJob.remote,
              employmentType: publicJob.employmentType,
              salaryText: publicJob.salaryText,
              publishedAt: publicJob.publishedAt,
              lastFetched: publicJob.board.lastSuccessAt!,
              workArrangement: publicJob.remote === true ? "remote" : null,
              relatedFingerprint: createHash("sha256")
                .update(
                  `${publicJob.employer}|${publicJob.title}|${publicJob.location}`.toLowerCase(),
                )
                .digest("hex"),
            },
          })
        ).id;
      if (!source)
        await tx.jobSource.create({
          data: {
            jobId,
            providerId: publicJob.providerId,
            publisher: `${publicJob.board.platform} public board`,
            sourceUrl: publicJob.sourceUrl,
            primaryUrl: normalizedUrl(publicJob.applyUrl),
            applyLinks: [
              {
                url: publicJob.applyUrl,
                publisher: publicJob.board.name,
                direct: true,
              },
            ],
          },
        });
      await tx.savedJob.upsert({
        where: { jobId },
        create: { jobId },
        update: {},
      });
      return { jobId, saved: true };
    },
    { timeout: 15_000 },
  );
}
