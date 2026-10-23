import { z } from "zod";
import { authDb, db } from "./db";
import { matchCollection, matchDeck, matchSettings } from "./matches";
import { safeUrl } from "./contracts";

export const jobWorkspaceTabs = [
  "matching",
  "queued",
  "saved",
  "passed",
  "applied",
  "interviews",
  "offers",
  "attention",
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
};
const issueStates = ["needs_input", "failed", "uncertain"];
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
  const [pipeline, decisions, issueCount, settings] = await Promise.all([
    db.application.groupBy({ by: ["status"], _count: true }),
    db.matchDecision.groupBy({ by: ["state"], _count: true }),
    db.automationTask.count({ where: { state: { in: issueStates } } }),
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
    attention: issueCount,
  };
  let rows: WorkspaceOpportunity[] = [],
    total = 0;
  if (tab === "matching" && matchingAvailable && settings?.preferences) {
    const result = await matchDeck(params);
    total = result.total;
    rows = result.jobs.map((job) => ({
      id: job.id,
      source: "catalog",
      title: job.title,
      employer: job.employer,
      location: job.location,
      status: "matching",
      applyUrl: safeUrl(job.applyUrl),
      description: job.summary,
      match: job,
    }));
  } else if (["queued", "saved", "passed"].includes(tab)) {
    const result = await matchCollection(tab, page);
    total = result.total;
    rows = result.rows.map((row) => {
      const snapshot = row.snapshot as {
        title: string;
        employer: string;
        location?: string | null;
        applyUrl: string;
      };
      return {
        id: row.catalogId,
        source: "catalog",
        title: snapshot.title,
        employer: snapshot.employer,
        location: snapshot.location || null,
        applyUrl: row.available ? safeUrl(snapshot.applyUrl) : null,
        status: row.processing?.state || row.application?.status || row.state,
        detail: row.processing?.detail,
        applicationId: row.application?.id,
      };
    });
  } else if (tab === "attention") {
    const tasks = await db.automationTask.findMany({
      where: { state: { in: issueStates } },
      orderBy: { updatedAt: "desc" },
      take: 30,
      skip: (page - 1) * 30,
    });
    const jobs = await authDb.catalogJob.findMany({
      where: { id: { in: tasks.map((task) => task.catalogId) } },
      select: { id: true, title: true, employer: true, location: true },
    });
    total = issueCount;
    rows = tasks.map((task) => {
      const job = jobs.find((job) => job.id === task.catalogId);
      return {
        id: task.catalogId,
        source: "catalog",
        title: job?.title || "Application",
        employer: job?.employer || "Employer",
        location: job?.location || null,
        applyUrl: safeUrl(task.targetUrl),
        status: task.state,
        detail: task.detail,
      };
    });
  } else if (["applied", "interviews", "offers"].includes(tab)) {
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
      take: 30,
      skip: (page - 1) * 30,
    });
    total = statusCount(status);
    rows = applications.map((app) => ({
      id: app.job.id,
      source: "workspace",
      title: app.job.title,
      employer: app.job.employer,
      location: app.job.location,
      description: app.job.description || "",
      applyUrl: null,
      status: app.status,
      applicationId: app.id,
    }));
  }
  return {
    tab,
    page,
    pageSize: 30,
    rows,
    total,
    counts,
    settings,
    matchingAvailable,
  };
}
