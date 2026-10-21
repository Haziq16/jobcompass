import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { settings, dayKey } from "./settings";
import {
  AppError,
  normalizedUrl,
  type JobProvider,
  type ProviderSearchInput,
} from "./contracts";
import { JSearchProvider } from "./provider";
import { DirectBoardProvider } from "./direct-provider";
import { workspaceId } from "./workspace-context";
export function fingerprint(input: ProviderSearchInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        query: input.query.trim().replace(/\s+/g, " ").toLowerCase(),
        country: input.country.toLowerCase(),
        language: input.language || null,
        remoteOnly: input.remoteOnly,
        datePosted: input.datePosted,
        cursor: input.cursor || null,
      }),
    )
    .digest("hex");
}
export async function lock(tx: Pick<Prisma.TransactionClient, "$executeRaw">) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(640912)`;
}
export async function discover(
  input: ProviderSearchInput,
  key: string,
  refresh = false,
  provider: JobProvider = new JSearchProvider(),
) {
  await settings();
  const direct = provider instanceof DirectBoardProvider;
  const fp = direct
    ? `direct:${provider.identity}:${fingerprint(input)}`
    : fingerprint(input);
  const reservation = await db.$transaction(
    async (tx) => {
      await lock(tx);
      const now = new Date();
      await tx.apiRequestLedger.updateMany({
        where: {
          state: "sent",
          createdAt: { lt: new Date(now.valueOf() - 120000) },
        },
        data: { state: "uncertain", errorCategory: "interrupted" },
      });
      await tx.apiRequestLedger.updateMany({
        where: {
          state: "reserved",
          createdAt: { lt: new Date(now.valueOf() - 120000) },
        },
        data: { state: "released", errorCategory: "not_dispatched" },
      });
      const prior = await tx.fetchIntent.findUnique({
        where: { workspaceId_key: { workspaceId: workspaceId(), key } },
        include: { ledger: true },
      });
      if (prior) {
        if (prior.fingerprint !== fp)
          throw new AppError("idempotency_conflict", 409);
        return {
          ledger: prior.ledger,
          runId: prior.runId || prior.ledger?.runId,
          owner: false,
          cached: false,
        };
      }
      if (!refresh) {
        const cached = await tx.searchRun.findFirst({
          where: { fingerprint: fp, expiresAt: { gt: now } },
          orderBy: { fetchedAt: "desc" },
        });
        if (cached) {
          await tx.fetchIntent.create({
            data: { key, fingerprint: fp, runId: cached.id },
          });
          return { runId: cached.id, owner: false, cached: true, ledger: null };
        }
      }
      const pending = await tx.apiRequestLedger.findFirst({
        where: { fingerprint: fp, state: { in: ["reserved", "sent"] } },
      });
      if (pending) {
        await tx.fetchIntent.create({
          data: { key, fingerprint: fp, ledgerId: pending.id },
        });
        return { ledger: pending, owner: false, cached: false, runId: null };
      }
      if (provider instanceof JSearchProvider) {
        if (!process.env.JSEARCH_API_KEY)
          throw new AppError("disconnected", 503);
        if (process.env.JSEARCH_PLAN_CONFIRMED !== "true")
          throw new AppError("confirm_plan", 503);
      }
      const s = await tx.settings.findUniqueOrThrow({ where: { id: "owner" } });
      if (!direct && s.providerPaused)
        throw new AppError("provider_paused", 429);
      if (!direct && (now < s.cycleStart || now >= s.cycleEnd))
        throw new AppError("cycle_expired", 429);
      const rows = await tx.apiRequestLedger.findMany({
        where: { state: { not: "released" } },
      });
      const monthly = Math.max(
        0,
        rows
          .filter((r) => r.cycleId === s.cycleStart.toISOString())
          .reduce((v, r) => v + r.units, 0) + s.adjustment,
      );
      const day = dayKey(now, s.timezone);
      const daily = rows
        .filter((r) => dayKey(r.createdAt, s.timezone) === day)
        .reduce((v, r) => v + r.units, 0);
      if (direct) {
        const attempts = rows.filter(
          (r) =>
            r.fingerprint.startsWith("direct:") &&
            r.createdAt >= new Date(now.valueOf() - 86400000),
        );
        if (
          attempts.length >= 50 ||
          attempts.some((r) => r.createdAt > new Date(now.valueOf() - 10000))
        )
          throw new AppError("direct_rate_limit", 429);
      }
      if (!direct && monthly + 1 > Math.min(s.allowance, s.budget))
        throw new AppError("monthly_limit", 429);
      if (!direct && daily + 1 > s.dailyCap)
        throw new AppError("daily_limit", 429);
      const ledger = await tx.apiRequestLedger.create({
        data: {
          fingerprint: fp,
          cycleId: s.cycleStart.toISOString(),
          dayKey: day,
          units: direct ? 0 : 1,
        },
      });
      await tx.fetchIntent.create({
        data: { key, fingerprint: fp, ledgerId: ledger.id },
      });
      return { ledger, owner: true, cached: false, runId: null };
    },
    { timeout: 15000, maxWait: 15000 },
  );
  if (reservation.runId)
    return {
      run: await db.searchRun.findUnique({ where: { id: reservation.runId } }),
      cached: reservation.cached,
    };
  const ledger = reservation.ledger!;
  if (!reservation.owner) {
    if (["failed", "uncertain", "released"].includes(ledger.state))
      throw new AppError(
        ledger.errorCategory || "previous_attempt_failed",
        409,
      );
    return { pending: true, ledgerId: ledger.id };
  }
  const dispatched = await db.apiRequestLedger.updateMany({
    where: { id: ledger.id, state: "reserved" },
    data: { state: "sent", dispatchedAt: new Date() },
  });
  if (!dispatched.count) throw new AppError("reservation_expired", 409);
  try {
    const result = await provider.search(input);
    const s = await settings();
    const run = await db.$transaction(
      async (tx) => {
        // Serialize normalization writes too: different searches can contain the same provider ID.
        await lock(tx);
        const run = await tx.searchRun.create({
          data: {
            fingerprint: fp,
            input: direct
              ? { ...input, directBoard: provider.board }
              : (input as Prisma.InputJsonValue),
            nextCursor: result.nextCursor,
            fetchedAt: new Date(result.fetchedAt),
            expiresAt: new Date(Date.now() + s.cacheHours * 3600000),
          },
        });
        for (const j of result.jobs) {
          const { providerId, publisher, sourceUrl, applyLinks, ...fields } = j;
          const metadata = {
            workArrangement: j.remote === true ? "remote" : null,
            metadataProvenance: {
              workArrangement:
                j.remote === true
                  ? direct
                    ? "Lever workplaceType=remote"
                    : "JSearch job_is_remote=true"
                  : direct
                    ? "Unknown: public board does not supply an explicit remote value"
                    : "Unknown: remote=false does not distinguish on-site from hybrid",
            },
          };
          const primaryUrl = applyLinks[0]
            ? normalizedUrl(applyLinks[0].url)
            : null;
          let source = await tx.jobSource.findUnique({
            where: {
              workspaceId_providerId: {
                workspaceId: workspaceId(),
                providerId,
              },
            },
          });
          // A URL match is sufficient only when the identifying title, employer and location agree.
          const relatedFingerprint = createHash("sha256")
            .update(`${j.employer}|${j.title}|${j.location}`.toLowerCase())
            .digest("hex");
          let jobId = source?.jobId;
          if (!jobId && primaryUrl) {
            source = await tx.jobSource.findFirst({
              where: { primaryUrl, job: { relatedFingerprint } },
            });
            jobId = source?.jobId;
          }
          const job = jobId
            ? await tx.job.update({
                where: { id: jobId },
                data: {
                  ...fields,
                  ...metadata,
                  lastFetched: new Date(result.fetchedAt),
                },
              })
            : await tx.job.create({
                data: {
                  ...fields,
                  ...metadata,
                  relatedFingerprint,
                  lastFetched: new Date(result.fetchedAt),
                },
              });
          await tx.jobSource.upsert({
            where: {
              workspaceId_providerId: {
                workspaceId: workspaceId(),
                providerId,
              },
            },
            create: {
              jobId: job.id,
              providerId,
              publisher,
              sourceUrl,
              primaryUrl,
              applyLinks: applyLinks as Prisma.InputJsonValue,
            },
            update: {
              publisher,
              sourceUrl,
              primaryUrl,
              applyLinks: applyLinks as Prisma.InputJsonValue,
              fetchedAt: new Date(),
            },
          });
          await tx.searchRunJob.upsert({
            where: { runId_jobId: { runId: run.id, jobId: job.id } },
            create: { runId: run.id, jobId: job.id },
            update: {},
          });
        }
        await tx.apiRequestLedger.update({
          where: { id: ledger.id },
          data: {
            state: "succeeded",
            runId: run.id,
            completedAt: new Date(),
            providerStatus: 200,
          },
        });
        return run;
      },
      { timeout: 20000 },
    );
    return { run, cached: false };
  } catch (error) {
    const e =
      error instanceof AppError
        ? error
        : new AppError("storage_or_provider_error", 502);
    await db.apiRequestLedger.update({
      where: { id: ledger.id },
      data: {
        state:
          e.code === "timeout" || e.code === "storage_or_provider_error"
            ? "uncertain"
            : "failed",
        completedAt: new Date(),
        errorCategory: e.code,
        providerStatus: e.upstreamStatus,
      },
    });
    if (e.code === "provider_quota")
      await db.settings.update({
        where: { id: "owner" },
        data: { providerPaused: true },
      });
    throw e;
  }
}
