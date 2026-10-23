import { Prisma } from "@prisma/client";
import { authDb, db } from "./db";
import { AppError } from "./contracts";
import { workspaceId } from "./workspace-context";
import { listCatalog } from "./catalog";
import {
  recommendationProfile,
  recommendationSql,
  type SearchProfile,
} from "./job-recommendations";
import { catalogSkillKeys } from "./catalog-skill-signals";
import {
  matchPreferencesSchema,
  matchActionSchema,
  type MatchPreferences,
} from "./match-contracts";

const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const like = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;
const rx = (s: string) =>
  `(^|[^a-z0-9])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`;
async function matchLock(tx: Pick<Prisma.TransactionClient, "$executeRaw">) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`matches:${workspaceId()}`},0))`;
}
export async function matchSettings() {
  const [saved, profile] = await Promise.all([
    db.matchPreferences.findUnique({ where: { workspaceId: workspaceId() } }),
    recommendationProfile(),
  ]);
  return {
    preferences: saved?.values || null,
    revision: saved?.revision || 0,
    suggested: {
      titles: profile.titles.slice(0, 24),
      skills: profile.skills.slice(0, 24).map((s) => s.term),
      locations: profile.locations,
      arrangement: profile.arrangement,
    },
    hasCv: profile.hasCv,
  };
}
export async function saveMatchSettings(
  input: unknown,
  expectedRevision: number,
) {
  const values = matchPreferencesSchema.parse(input);
  return db.$transaction(async (tx) => {
    await matchLock(tx);
    const current = await tx.matchPreferences.findUnique({
      where: { workspaceId: workspaceId() },
    });
    if ((current?.revision || 0) !== expectedRevision)
      throw new AppError("revision_conflict", 409);
    return tx.matchPreferences.upsert({
      where: { workspaceId: workspaceId() },
      create: { workspaceId: workspaceId(), values: json(values) },
      update: { values: json(values), revision: { increment: 1 } },
    });
  });
}
async function preferences() {
  const saved = await db.matchPreferences.findUnique({
    where: { workspaceId: workspaceId() },
  });
  if (!saved) throw new AppError("match_setup_required", 409);
  return matchPreferencesSchema.parse(saved.values);
}
export function salaryEvidence(text: string | null) {
  if (!text) return null;
  // Only compare explicit currency and period. A bare $ or unlabelled figure is unknown.
  const currency = text
    .match(/\b(USD|SGD|MYR|GBP|EUR|CAD|AUD|INR)\b/i)?.[1]
    ?.toUpperCase();
  const period = /\b(year|annual|annually|yr)\b/i.test(text)
    ? "year"
    : /\b(month|monthly|mo)\b/i.test(text)
      ? "month"
      : /\b(hour|hourly|hr)\b/i.test(text)
        ? "hour"
        : null;
  const values = [...text.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/gi)].map(
    (m) => Number(m[1].replaceAll(",", "")) * (m[2] ? 1000 : 1),
  );
  return currency && period && values.length
    ? { currency, period, maximum: Math.max(...values) }
    : null;
}
function salarySql(p: MatchPreferences) {
  // Mirrors salaryEvidence's conservative explicit-currency/period policy.
  const period =
    p.salaryPeriod === "year"
      ? "(year|annual|annually|yr)"
      : p.salaryPeriod === "month"
        ? "(month|monthly|mo)"
        : "(hour|hourly|hr)";
  const comparable = Prisma.sql`j."salaryText" ~* ${rx(p.salaryCurrency)} AND j."salaryText" ~* ${`(^|[^a-z0-9])${period}($|[^a-z0-9])`}`;
  const maximum = Prisma.sql`(SELECT MAX((replace(m[1],',','')::numeric)*CASE WHEN lower(m[2])='k' THEN 1000 ELSE 1 END) FROM regexp_matches(j."salaryText", ${String.raw`(\m[0-9][0-9,]*(?:\.[0-9]+)?)\s*(k)?\M`},'gi') m)`;
  return p.allowUnknown
    ? Prisma.sql`NOT COALESCE((${comparable}) AND ${maximum}<${p.salaryMinimum},false)`
    : Prisma.sql`(${comparable}) AND ${maximum}>=${p.salaryMinimum}`;
}
export function preferenceWhere(p: MatchPreferences, profile: SearchProfile) {
  const clauses: Prisma.Sql[] = [Prisma.sql`true`];
  if (p.excludedCompanies.length)
    clauses.push(
      Prisma.sql`NOT (${Prisma.join(
        p.excludedCompanies.map((t) => Prisma.sql`j.employer ILIKE ${like(t)}`),
        " OR ",
      )})`,
    );
  for (const term of p.excluded)
    clauses.push(Prisma.sql`NOT (j."searchText" ~* ${rx(term)})`);
  if (p.roleStrict && p.titles.length)
    clauses.push(
      Prisma.sql`(${Prisma.join(
        p.titles.map((t) => Prisma.sql`j.title ILIKE ${like(t)}`),
        " OR ",
      )})`,
    );
  if (p.locationStrict && p.locations.length)
    clauses.push(
      Prisma.sql`(${Prisma.join(
        p.locations.map((t) => Prisma.sql`j.location ILIKE ${like(t)}`),
        " OR ",
      )} ${p.allowUnknown ? Prisma.sql`OR j.location IS NULL` : Prisma.empty})`,
    );
  if (p.arrangementStrict && p.arrangement !== "any") {
    const known =
      p.arrangement === "remote"
        ? Prisma.sql`j.remote=true`
        : p.arrangement === "hybrid"
          ? Prisma.sql`j."searchText" ~* ${rx("hybrid")}`
          : Prisma.sql`j."searchText" ~* ${"(^|[^a-z0-9])on.?site($|[^a-z0-9])"}`;
    clauses.push(
      p.allowUnknown
        ? Prisma.sql`(${known}) OR (j.remote IS NULL AND j."searchText" !~* ${"(^|[^a-z0-9])(hybrid|on.?site|remote)($|[^a-z0-9])"})`
        : known,
    );
  }
  if (p.employmentTypes.length)
    clauses.push(
      Prisma.sql`(${Prisma.join(
        p.employmentTypes.map(
          (t) =>
            Prisma.sql`replace(lower(j."employmentType"),'_','-') LIKE ${like(t)}`,
        ),
        " OR ",
      )} ${p.allowUnknown ? Prisma.sql`OR j."employmentType" IS NULL` : Prisma.empty})`,
    );
  if (!p.includeStretch && (p.seniority === "entry" || p.seniority === "mid"))
    clauses.push(
      Prisma.sql`j.title !~* ${"(^|[^a-z0-9])(senior|staff|principal|director|head)($|[^a-z0-9])"}`,
    );
  if (p.needsSponsorship && p.excludeNoSponsorship)
    clauses.push(
      Prisma.sql`j."searchText" !~* '(no (visa )?sponsorship|cannot (provide|offer|sponsor)|unable to (provide|offer) (visa )?sponsorship|will not sponsor)'`,
    );
  if (p.salaryStrict && p.salaryMinimum !== null) clauses.push(salarySql(p));
  // A personalised deck may contain broad matches, but never an all-zero random fallback.
  clauses.push(
    Prisma.sql`${recommendationSql({ ...profile, locations: [], arrangement: "any" })} > 0`,
  );
  return Prisma.sql`${Prisma.join(
    clauses.map((c) => Prisma.sql`(${c})`),
    " AND ",
  )}`;
}
export async function matchDeck(params: URLSearchParams) {
  const p = await preferences();
  const base = await recommendationProfile();
  const profile: SearchProfile = {
    ...base,
    titles: p.titles,
    skills: [
      ...new Map(
        [...p.skills, ...base.skills.map((s) => s.term)].map((t) => [
          t.toLowerCase(),
          t,
        ]),
      ).values(),
    ]
      .slice(0, 32)
      .map((term) => ({
        term,
        source: base.skills.some(
          (s) =>
            s.term.toLowerCase() === term.toLowerCase() && s.source === "cv",
        )
          ? "cv"
          : "profile",
      })),
    locations: p.locations,
    arrangement: p.arrangement,
    excluded: p.excluded,
  };
  const workspace = workspaceId();
  const where = Prisma.sql`${preferenceWhere(p, profile)} AND NOT EXISTS (SELECT 1 FROM "MatchDecision" d WHERE d."workspaceId"=${workspace} AND d.state<>'undone' AND (d."catalogId"=j.id OR d."applyUrl"=j."applyUrl")) AND NOT EXISTS (SELECT 1 FROM "JobSource" s JOIN "Job" x ON x.id=s."jobId" AND x."workspaceId"=s."workspaceId" WHERE s."workspaceId"=${workspace} AND (s."providerId"=j."providerId" OR s."primaryUrl"=j."applyUrl") AND (EXISTS(SELECT 1 FROM "SavedJob" z WHERE z."jobId"=x.id AND z."workspaceId"=${workspace}) OR EXISTS(SELECT 1 FROM "Application" a WHERE a."jobId"=x.id AND a."workspaceId"=${workspace})))`;
  const query = new URLSearchParams(params);
  query.set("forYou", "true");
  query.set("page", "1");
  const feedback = await db.matchDecision.findMany({
    where: {
      state: "passed",
      reason: { in: ["Employer", "Wrong role", "Location"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const uniqueFeedback = [
    ...new Map(
      feedback.map((row) => {
        const s = row.snapshot as {
          employer?: string;
          title?: string;
          location?: string;
        };
        const value =
          row.reason === "Employer"
            ? s.employer
            : row.reason === "Wrong role"
              ? s.title
              : s.location;
        return [row.reason + ":" + (value || ""), row] as const;
      }),
    ).values(),
  ];
  const penalties = uniqueFeedback.slice(0, 24).map((row) => {
    const snapshot = row.snapshot as {
      employer?: string;
      title?: string;
      location?: string;
    };
    return row.reason === "Employer"
      ? Prisma.sql`CASE WHEN j.employer=${snapshot.employer || ""} THEN -2 ELSE 0 END`
      : row.reason === "Wrong role"
        ? Prisma.sql`CASE WHEN j.title=${snapshot.title || ""} THEN -2 ELSE 0 END`
        : Prisma.sql`CASE WHEN j.location=${snapshot.location || ""} THEN -1 ELSE 0 END`;
  });
  const result = await listCatalog(
    query,
    where,
    profile,
    penalties.length ? Prisma.sql`${Prisma.join(penalties, " + ")}` : undefined,
  );
  const raw = await authDb.catalogJob.findMany({
    where: { id: { in: result.jobs.map((j) => j.id) } },
    select: { id: true, description: true, searchText: true, salaryText: true },
  });
  const byId = new Map(raw.map((j) => [j.id, j]));
  const decisions = await db.matchDecision.findMany({
    where: { catalogId: { in: result.jobs.map((j) => j.id) } },
  });
  return {
    ...result,
    jobs: result.jobs.map((j) => {
      const r = byId.get(j.id)!;
      const otherSkills = catalogSkillKeys(r.searchText)
        .filter(
          (t) =>
            !profile.skills.some((s) => s.term.toLowerCase() === t) &&
            ![
              "senior",
              "staff",
              "principal",
              "director",
              "intern",
              "internship",
              "unpaid",
              "commission",
              "contract",
              "temporary",
              "freelance",
              "sponsorship",
              "visa",
              "remote",
              "onsite",
              "on-site",
              "recruiter",
              "agency",
              "consultant",
              "security clearance",
            ].includes(t),
        )
        .slice(0, 6);
      const warnings = [
        ...(!j.salaryText ? ["Salary not supplied"] : []),
        "Work authorization and sponsorship eligibility are not verified",
        ...(j.remote === true
          ? ["Remote may still have country restrictions"]
          : []),
        ...(!p.includeStretch
          ? []
          : /\b(senior|staff|principal|director)\b/i.test(j.title) &&
              p.seniority === "entry"
            ? ["This may be a stretch in seniority"]
            : []),
      ];
      const requirements = (r.description || "")
        .split(/(?<=[.!?])\s+|\n/)
        .filter((s) => /\b(required|must have|minimum|essential)\b/i.test(s))
        .slice(0, 3)
        .map((s) => s.trim().slice(0, 320));
      return {
        ...j,
        summary: (
          r.description || "The employer has not supplied a description."
        )
          .replace(/\s+/g, " ")
          .slice(0, 460),
        otherSkills,
        requirements,
        warnings,
        decisionRevision:
          decisions.find((d) => d.catalogId === j.id)?.revision || 0,
      };
    }),
  };
}
export async function matchCounts() {
  const rows = await db.matchDecision.groupBy({
    by: ["state"],
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.state, r._count._all]));
}
export async function decideMatch(input: unknown) {
  const data = matchActionSchema.parse(input);
  const workspace = workspaceId();
  return db.$transaction(
    async (tx) => {
      await matchLock(tx);
      const repeated = await tx.matchAction.findUnique({
        where: { id: data.requestId },
      });
      if (repeated) return { actionId: repeated.id, replayed: true };
      // UUIDs are global, but another account's request can never become an alias.
      if (
        await authDb.matchAction.count({
          where: { id: data.requestId, workspaceId: { not: workspace } },
        })
      )
        throw new AppError("revision_conflict", 409);
      const old = await tx.matchDecision.findUnique({
        where: {
          workspaceId_catalogId: {
            workspaceId: workspace,
            catalogId: data.catalogId,
          },
        },
      });
      if ((old?.revision || 0) !== data.expectedRevision)
        throw new AppError("revision_conflict", 409);
      const job = await tx.catalogJob.findUnique({
        where: { id: data.catalogId },
        include: { board: true },
      });
      if (!job && !old) throw new AppError("job_not_found", 404);
      const available =
        job &&
        job.active &&
        job.board.enabled &&
        job.board.lastSuccessAt &&
        job.board.lastSuccessAt.valueOf() > Date.now() - 48 * 3600000;
      if (!available && data.state === "queued")
        throw new AppError("listing_unavailable", 409);
      const snapshot = job
        ? json({
            id: job.id,
            title: job.title,
            employer: job.employer,
            location: job.location,
            remote: job.remote,
            salaryText: job.salaryText,
            applyUrl: job.applyUrl,
            sourceUrl: job.sourceUrl,
            firstSeen: job.firstSeen,
            publishedAt: job.publishedAt,
          })
        : (old!.snapshot as Prisma.InputJsonValue);
      const decision = await tx.matchDecision.upsert({
        where: {
          workspaceId_catalogId: {
            workspaceId: workspace,
            catalogId: data.catalogId,
          },
        },
        create: {
          workspaceId: workspace,
          catalogId: data.catalogId,
          providerId: job?.providerId || old!.providerId,
          applyUrl: job?.applyUrl || old!.applyUrl,
          state: data.state,
          reason: data.reason,
          snapshot,
        },
        update: {
          state: data.state,
          reason: data.reason,
          revision: { increment: 1 },
          snapshot,
        },
      });
      await tx.matchAction.create({
        data: {
          id: data.requestId,
          workspaceId: workspace,
          decisionId: decision.id,
          previous: json(
            old
              ? { state: old.state, reason: old.reason, priority: old.priority }
              : { state: "undone", reason: null, priority: 0 },
          ),
          afterRevision: decision.revision,
        },
      });
      return { actionId: data.requestId, decision };
    },
    { timeout: 15000 },
  );
}
export async function undoMatch(actionId: string) {
  return db.$transaction(async (tx) => {
    await matchLock(tx);
    const action = await tx.matchAction.findUnique({ where: { id: actionId } });
    if (!action) throw new AppError("not_found", 404);
    if (action.undoneAt) return { undone: true };
    const decision = await tx.matchDecision.findUnique({
      where: { id: action.decisionId },
    });
    if (!decision || decision.revision !== action.afterRevision)
      throw new AppError("revision_conflict", 409);
    const prior = action.previous as {
      state: string;
      reason: string | null;
      priority: number;
    } | null;
    await tx.matchDecision.update({
      where: { id: decision.id },
      data: {
        state: prior?.state || "undone",
        reason: prior?.reason || null,
        priority: prior?.priority || 0,
        revision: { increment: 1 },
      },
    });
    await tx.matchAction.update({
      where: { id: action.id },
      data: { undoneAt: new Date() },
    });
    return { undone: true };
  });
}
export async function matchCollection(state: string, page = 1) {
  const where = { state };
  const [rows, total, counts, latest] = await Promise.all([
    db.matchDecision.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * 30,
      take: 30,
    }),
    db.matchDecision.count({ where }),
    matchCounts(),
    authDb.$queryRaw<
      { id: string }[]
    >`SELECT a.id FROM "MatchAction" a JOIN "MatchDecision" d ON d.id=a."decisionId" AND d."workspaceId"=a."workspaceId" WHERE a."workspaceId"=${workspaceId()} AND a."undoneAt" IS NULL AND a."afterRevision"=d.revision ORDER BY a."createdAt" DESC,a.id DESC LIMIT 1`,
  ]);
  const jobs = await authDb.catalogJob.findMany({
    where: { id: { in: rows.map((r) => r.catalogId) } },
    select: {
      id: true,
      providerId: true,
      active: true,
      board: { select: { enabled: true, lastSuccessAt: true } },
    },
  });
  const sources = await db.jobSource.findMany({
    where: { providerId: { in: rows.map((r) => r.providerId) } },
    select: {
      providerId: true,
      jobId: true,
      job: { select: { application: { select: { id: true, status: true } } } },
    },
  });
  return {
    rows: rows.map((row) => {
      const job = jobs.find((j) => j.id === row.catalogId);
      const source = sources.find((s) => s.providerId === row.providerId);
      return {
        ...row,
        available: Boolean(
          job?.active &&
          job.board.enabled &&
          job.board.lastSuccessAt &&
          job.board.lastSuccessAt.valueOf() > Date.now() - 48 * 3600000,
        ),
        personalJobId: source?.jobId || null,
        application: source?.job.application || null,
      };
    }),
    total,
    counts,
    lastActionId: latest[0]?.id || null,
    page,
  };
}
export async function prioritizeMatch(
  id: string,
  priority: number,
  expectedRevision: number,
) {
  const changed = await db.matchDecision.updateMany({
    where: { id, revision: expectedRevision, state: "queued" },
    data: { priority, revision: { increment: 1 } },
  });
  if (!changed.count) throw new AppError("revision_conflict", 409);
  return { updated: true };
}
export async function resetMatchLearning() {
  // Only explicit pass reasons influence ordering. Clear those signals, retaining decisions.
  await db.matchDecision.updateMany({
    where: { state: "passed", reason: { not: null } },
    data: { reason: null, revision: { increment: 1 } },
  });
  return { reset: true };
}
