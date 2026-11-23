import { z } from "./zod";
import { db } from "./db";
import { matchCollection, matchDeck, matchSettings } from "./matches";
import { safeUrl } from "./contracts";
import type { VerdictRecord } from "./apply-verdict";

export const jobWorkspaceTabs = [
  "matching",
  "queued",
  "saved",
  "passed",
  "applied",
  "interviews",
  "offers",
] as const;
export type JobWorkspaceTab = (typeof jobWorkspaceTabs)[number];
export type WorkspaceOpportunity = {
  id: string;
  source: "catalog" | "workspace";
  title: string;
  employer: string;
  location: string | null;
  status: string;
  applyUrl: string | null;
  description?: string;
  detail?: string | null;
  applicationId?: string | null;
  match?: Awaited<ReturnType<typeof matchDeck>>["jobs"][number];
  verdict?: RowVerdict | null;
};
export type RowVerdict = {
  reviewId: string;
  decision: "apply" | "maybe" | "skip" | null;
  score: number | null;
  record: VerdictRecord | null;
  reviewedAt: string;
};
export const verdictFilters = ["apply", "maybe", "skip", "none"] as const;
const pageSize = 30;
// Latest succeeded review per job decides the badge, even when it has no verdict.
async function latestVerdicts() {
  const reviews = await db.aiReview.findMany({
    where: { state: "succeeded" },
    select: {
      id: true,
      jobSnapshot: true,
      verdict: true,
      verdictDecision: true,
      verdictScore: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const latest = new Map<string, RowVerdict>();
  for (const review of reviews) {
    const job = review.jobSnapshot as { source?: string; id?: string };
    const key = `${job.source}:${job.id}`;
    if (latest.has(key)) continue;
    latest.set(key, {
      reviewId: review.id,
      decision: review.verdictDecision as RowVerdict["decision"],
      score: review.verdictScore,
      record: (review.verdict as VerdictRecord | null) || null,
      reviewedAt: review.createdAt.toISOString(),
    });
  }
  return latest;
}
export async function jobWorkspace(
  params: URLSearchParams,
  matchingAvailable: boolean,
) {
  const tab = z.enum(jobWorkspaceTabs).parse(params.get("tab") || "matching");
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .parse(params.get("page") || 1);
  const [pipeline, decisions, settings] = await Promise.all([
    db.application.groupBy({ by: ["status"], _count: true }),
    db.matchDecision.groupBy({ by: ["state"], _count: true }),
    matchingAvailable ? matchSettings() : null,
  ]);
  const statusCount = (status: string) =>
    pipeline.find((r) => r.status === status)?._count || 0;
  const decisionCount = (state: string) =>
    decisions.find((r) => r.state === state)?._count || 0;
  const counts = {
    queued: decisionCount("queued"),
    saved: decisionCount("saved"),
    passed: decisionCount("passed"),
    applied: statusCount("Applied"),
    interviews: statusCount("Interview"),
    offers: statusCount("Offer"),
  };
  async function loadPage(
    pageNumber: number,
  ): Promise<{ rows: WorkspaceOpportunity[]; total: number }> {
    if (tab === "matching") {
      if (!matchingAvailable || !settings?.preferences)
        return { rows: [], total: 0 };
      const deckParams = new URLSearchParams(params);
      deckParams.set("page", String(pageNumber));
      deckParams.delete("verdict");
      deckParams.delete("sort");
      const result = await matchDeck(deckParams);
      return {
        total: result.total,
        rows: result.jobs.map((job) => ({
          id: job.id,
          source: "catalog",
          title: job.title,
          employer: job.employer,
          location: job.location,
          status: "matching",
          applyUrl: safeUrl(job.applyUrl),
          description: job.summary,
          match: job,
        })),
      };
    }
    if (["queued", "saved", "passed"].includes(tab)) {
      const result = await matchCollection(tab, pageNumber);
      return {
        total: result.total,
        rows: result.rows.map((row) => {
          const snapshot = row.snapshot as {
            title: string;
            employer: string;
            location?: string | null;
            applyUrl: string;
          };
          return {
            id: row.catalogId,
            source: "catalog" as const,
            title: snapshot.title,
            employer: snapshot.employer,
            location: snapshot.location || null,
            applyUrl: row.available ? safeUrl(snapshot.applyUrl) : null,
            status: row.application?.status || row.state,
            applicationId: row.application?.id,
          };
        }),
      };
    }
    const status = {
      applied: "Applied",
      interviews: "Interview",
      offers: "Offer",
    }[tab as "applied" | "interviews" | "offers"];
    const applications = await db.application.findMany({
      where: { status },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            employer: true,
            location: true,
            description: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: pageSize,
      skip: (pageNumber - 1) * pageSize,
    });
    return {
      total: statusCount(status),
      rows: applications.map((app) => ({
        id: app.job.id,
        source: "workspace" as const,
        title: app.job.title,
        employer: app.job.employer,
        location: app.job.location,
        description: app.job.description || "",
        applyUrl: null,
        status: app.status,
        applicationId: app.id,
      })),
    };
  }
  const verdictFilter = params.get("verdict")
    ? z.enum(verdictFilters).parse(params.get("verdict"))
    : null;
  const sortByVerdict = params.get("sort") === "verdict";
  const verdicts = await latestVerdicts();
  const withVerdict = (row: WorkspaceOpportunity) => ({
    ...row,
    verdict: verdicts.get(`${row.source}:${row.id}`) || null,
  });
  let rows: WorkspaceOpportunity[] = [],
    total = 0,
    capped = false;
  if (!verdictFilter && !sortByVerdict) {
    const result = await loadPage(page);
    rows = result.rows.map(withVerdict);
    total = result.total;
  } else {
    // Filtering or sorting by verdict needs the whole (bounded) collection first.
    const maxPages = tab === "matching" ? 5 : 20;
    let collected: WorkspaceOpportunity[] = [];
    let available = 0;
    for (let p = 1; p <= maxPages; p++) {
      const result = await loadPage(p);
      available = result.total;
      collected.push(...result.rows);
      if (!result.rows.length || collected.length >= result.total) break;
    }
    capped = collected.length < available;
    collected = collected.map(withVerdict);
    if (verdictFilter)
      collected = collected.filter((row) =>
        verdictFilter === "none"
          ? !row.verdict?.decision
          : row.verdict?.decision === verdictFilter,
      );
    if (sortByVerdict)
      collected.sort(
        (a, b) => (b.verdict?.score ?? -1) - (a.verdict?.score ?? -1),
      );
    total = collected.length;
    rows = collected.slice((page - 1) * pageSize, page * pageSize);
  }
  return {
    tab,
    page,
    pageSize,
    rows,
    total,
    capped,
    verdictFilter,
    sortByVerdict,
    counts,
    settings,
    matchingAvailable,
  };
}
