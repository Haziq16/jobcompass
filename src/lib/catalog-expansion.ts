import { Prisma } from "@prisma/client";
import { catalogCapacity } from "./catalog-retention";
import { createHash } from "node:crypto";
import candidates from "../data/catalog-candidates.json";
import { authDb } from "./db";
import { boardUrl, type CatalogPlatform } from "./catalog-boards";
import { fetchCatalogBoard } from "./catalog-provider";
import { publishCatalogBoard } from "./catalog";

const revision = createHash("sha256")
  .update(JSON.stringify(candidates))
  .digest("hex")
  .slice(0, 16);
export async function seedCatalogCandidates() {
  const marker = `candidate-seed:${revision}`;
  if (await authDb.catalogSync.findUnique({ where: { id: marker } })) return;
  const unique = new Map<
    string,
    {
      id: string;
      platform: string;
      token: string;
      name: string;
      enabled: boolean;
    }
  >();
  for (const row of candidates) {
    const [platform, token, name] = row;
    if (
      ![
        "greenhouse",
        "lever",
        "lever-eu",
        "ashby",
        "workable",
        "recruitee",
      ].includes(platform)
    )
      throw new Error("Invalid candidate platform");
    boardUrl({ platform: platform as CatalogPlatform, token, name });
    unique.set(`${platform}:${token}`, {
      id: `${platform}:${token}`,
      platform,
      token,
      name,
      enabled: false,
    });
  }
  const rows = [...unique.values()];
  for (let start = 0; start < rows.length; start += 1000)
    await authDb.catalogBoard.createMany({
      data: rows.slice(start, start + 1000),
      skipDuplicates: true,
    });
  await authDb.catalogSync.createMany({
    data: [{ id: marker }],
    skipDuplicates: true,
  });
}

// Storage budget and capacity live in catalog-retention.ts so refreshes and
// admissions share one guard.
/** Candidates are never visible until a complete employer feed has been validated.
 * This owns a separate lease; normal refreshes continue even when growth is paused. */
export async function expandCatalog(
  options: {
    maxBoards?: number;
    timeBudgetMs?: number;
    bypassInterval?: boolean;
    request?: typeof fetch;
  } = {},
) {
  await seedCatalogCandidates();
  await authDb.catalogSync.createMany({
    data: [
      { id: "expansion", leaseUntil: new Date(0), nextRunAt: new Date(0) },
    ],
    skipDuplicates: true,
  });
  const now = new Date();
  const leased = await authDb.catalogSync.updateMany({
    where: {
      id: "expansion",
      leaseUntil: { lte: now },
      ...(options.bypassInterval ? {} : { nextRunAt: { lte: now } }),
    },
    data: {
      leaseUntil: new Date(now.valueOf() + 600000),
      nextRunAt: new Date(now.valueOf() + 6 * 3600000),
      startedAt: now,
    },
  });
  if (!leased.count)
    return {
      status: "already_current",
      checked: 0,
      activated: 0,
      failed: 0,
      added: 0,
    };
  let checked = 0,
    activated = 0,
    failed = 0,
    added = 0,
    deferred = 0,
    capacityPaused = false;
  try {
    const pending = await authDb.catalogBoard.findMany({
      where: {
        enabled: false,
        initialIndexedAt: null,
        nextFetchAt: { lte: now },
      },
      orderBy: [{ nextFetchAt: "asc" }, { id: "asc" }],
      take: Math.max(1, Math.min(50, options.maxBoards || 12)),
    });
    // Two bounded fetch workers; admission and storage reservations remain serial.
    let admission: Promise<unknown> = Promise.resolve();
    const workers = await Promise.allSettled(
      Array.from({ length: 2 }, async () => {
        while (pending.length) {
          const board = pending.shift()!;
          if (
            Date.now() - now.valueOf() >
            Math.min(120000, options.timeBudgetMs || 75000)
          )
            break;
          if (!(await catalogCapacity()).insertsAllowed) {
            capacityPaused = true;
            break;
          }
          checked++;
          await authDb.catalogBoard.update({
            where: { id: board.id },
            data: { lastAttemptAt: new Date() },
          });
          try {
            const snapshot = await fetchCatalogBoard(
              { ...board, platform: board.platform as CatalogPlatform },
              options.request,
            );
            if (snapshot.unchanged) throw new Error("Unexpected initial 304");
            const publish = admission.then(async () => {
              // Reject an oversized admission before writing any jobs. The estimate reserves
              // two JSON copies for row/index growth plus 8 MB for transaction overhead.
              const reserve =
                Buffer.byteLength(JSON.stringify(snapshot.jobs)) * 2 +
                8 * 1024 * 1024;
              const capacity = await catalogCapacity();
              if (
                !capacity.insertsAllowed ||
                capacity.usedBytes + reserve > capacity.budgetBytes
              ) {
                deferred++;
                await authDb.catalogBoard.update({
                  where: { id: board.id },
                  data: {
                    error: "catalog_capacity",
                    nextFetchAt: new Date(Date.now() + 86400000),
                  },
                });
                return;
              }
              await publishCatalogBoard(board.id, snapshot.jobs, new Date(), {
                activate: true,
                etag: snapshot.etag,
                modified: snapshot.modified,
              });
              activated++;
              added += snapshot.jobs.length;
            });
            admission = publish.catch(() => {});
            await publish;
          } catch (error) {
            failed++;
            await authDb.catalogBoard.update({
              where: { id: board.id },
              data: {
                failures: { increment: 1 },
                error:
                  error instanceof Prisma.PrismaClientKnownRequestError
                    ? "storage_error"
                    : "candidate_unavailable",
                nextFetchAt: new Date(
                  Date.now() +
                    Math.min(30, 2 ** Math.min(board.failures, 5)) * 86400000,
                ),
              },
            });
          }
        }
      }),
    );
    const rejected = workers.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
  } finally {
    await authDb.catalogSync.update({
      where: { id: "expansion" },
      data: { leaseUntil: new Date(), finishedAt: new Date() },
    });
  }
  return {
    status: capacityPaused ? "capacity_paused" : "completed",
    checked,
    activated,
    failed,
    added,
    deferred,
  };
}
