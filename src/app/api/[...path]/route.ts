import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { searchInput, statuses, safeUrl, AppError } from "@/lib/contracts";
import { discover, lock } from "@/lib/discovery";
import { profile, settings, usage } from "@/lib/settings";
import { matchJob } from "@/lib/matching";
import { extractCv } from "@/lib/cv";
import { authorize } from "@/lib/authorization";
import { jobFilters } from "@/lib/job-query";
import { accountRequest } from "@/lib/account-request";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const list = z.array(z.string().trim().min(1).max(100)).max(100);
const profileSchema = z
  .object({
    skills: list,
    titles: list,
    locations: list,
    excluded: list,
    years: z.number().min(0).max(70).nullable(),
    arrangement: z.enum(["any", "remote", "onsite"]),
    cvText: z.string().max(80000),
    aliases: z
      .record(z.string().max(100), z.array(z.string().min(1).max(100)).max(20))
      .default({}),
  })
  .strict();
const jobInclude = {
  sources: true,
  saved: true,
  application: {
    include: { events: { orderBy: { createdAt: "desc" as const } } },
  },
};
async function boundedBody(req: NextRequest, limit: number) {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new AppError("payload_too_large", 413);
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}
async function body(req: NextRequest) {
  const raw = new TextDecoder().decode(await boundedBody(req, 400000));
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("invalid_json");
  }
}
async function handler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    await authorize(req.headers, req.method);
    const path = (await context.params).path;
    const method = req.method;
    const first = path[0];
    if (first === "discovery" && path[1] === "search" && method === "POST") {
      if (process.env.PUBLIC_SIGNUP === "true")
        throw new AppError("paid_discovery_disabled", 403);
      const data = z
        .object({
          input: searchInput,
          key: z.string().uuid(),
          refresh: z.boolean().default(false),
        })
        .strict()
        .parse(await body(req));
      const result = await discover(data.input, data.key, data.refresh);
      return NextResponse.json(result, {
        status: "pending" in result ? 202 : 200,
      });
    }
    if (first === "usage" && method === "GET")
      return NextResponse.json(await usage());
    if (first === "jobs" && method === "GET") {
      const p = await profile();
      if (path[1]) {
        const job = await db.job.findUnique({
          where: { id: path[1] },
          include: jobInclude,
        });
        if (!job) throw new AppError("not_found", 404);
        return NextResponse.json({ ...job, match: matchJob(job, p) });
      }
      const params = req.nextUrl.searchParams;
      const filter = params.get("q") || "";
      const where: Prisma.JobWhereInput = {
        ...jobFilters(params),
        ...(params.has("skipped")
          ? {
              skippedAt:
                params.get("skipped") === "true" ? { not: null } : null,
            }
          : {}),
        hidden: params.get("hidden") === "true",
        ...(params.get("saved") === "true" ? { saved: { isNot: null } } : {}),
        ...(params.get("tracked") === "true"
          ? { application: { isNot: null } }
          : {}),
        ...(params.get("remote") === "true" ? { remote: true } : {}),
        ...(params.get("country") ? { country: params.get("country")! } : {}),
        ...(params.get("source")
          ? {
              sources: {
                some: {
                  publisher: {
                    contains: params.get("source")!,
                    mode: "insensitive",
                  },
                },
              },
            }
          : {}),
        ...(params.get("status")
          ? { application: { status: params.get("status")! } }
          : {}),
        ...(params.get("run")
          ? { runs: { some: { runId: params.get("run")! } } }
          : {}),
        ...(filter
          ? {
              OR: [
                { title: { contains: filter, mode: "insensitive" } },
                { employer: { contains: filter, mode: "insensitive" } },
                { saved: { notes: { contains: filter, mode: "insensitive" } } },
                { saved: { tags: { has: filter } } },
              ],
            }
          : {}),
      };
      const page = Math.max(
        1,
        Math.min(100000, Math.floor(Number(params.get("page")) || 1)),
      );
      const min = Math.max(0, Number(params.get("min")) || 0);
      if (!min && params.get("sort") !== "match") {
        const [jobs, total] = await db.$transaction([
          db.job.findMany({
            where,
            include: jobInclude,
            orderBy:
              params.get("sort") === "published"
                ? [
                    { publishedAt: { sort: "desc", nulls: "last" } },
                    { id: "asc" },
                  ]
                : [{ lastFetched: "desc" }, { id: "asc" }],
            skip: (page - 1) * 20,
            take: 20,
          }),
          db.job.count({ where }),
        ]);
        return NextResponse.json({
          jobs: jobs.map((j) => ({ ...j, match: matchJob(j, p) })),
          total,
          page,
          pages: Math.ceil(total / 20),
        });
      }
      const jobs = await db.job.findMany({
        where,
        include: jobInclude,
        orderBy: { lastFetched: "desc" },
      });
      let scored = jobs.map((j) => ({ ...j, match: matchJob(j, p) }));
      scored = scored.filter((j) => (j.match.score ?? 0) >= min);
      if (params.get("sort") === "match")
        scored.sort((a, b) => (b.match.score ?? -1) - (a.match.score ?? -1));
      if (params.get("sort") === "published")
        scored.sort(
          (a, b) =>
            (b.publishedAt?.valueOf() ?? 0) - (a.publishedAt?.valueOf() ?? 0),
        );
      return NextResponse.json({
        jobs: scored.slice((page - 1) * 20, page * 20),
        total: scored.length,
        page,
        pages: Math.ceil(scored.length / 20),
      });
    }
    if (first === "jobs" && path[1] && method === "PATCH") {
      const data = z
        .object({
          saved: z.boolean().optional(),
          hidden: z.boolean().optional(),
          skipped: z.boolean().optional(),
          notes: z.string().max(10000).optional(),
          tags: list.optional(),
        })
        .strict()
        .parse(await body(req));
      await db.$transaction(async (tx) => {
        await tx.job.findUniqueOrThrow({ where: { id: path[1] } });
        if (data.skipped !== undefined)
          await tx.job.update({
            where: { id: path[1] },
            data: { skippedAt: data.skipped ? new Date() : null },
          });
        if (data.hidden !== undefined)
          await tx.job.update({
            where: { id: path[1] },
            data: { hidden: data.hidden },
          });
        if (data.saved === false)
          await tx.savedJob.deleteMany({ where: { jobId: path[1] } });
        else if (
          data.saved ||
          data.notes !== undefined ||
          data.tags !== undefined
        )
          await tx.savedJob.upsert({
            where: { jobId: path[1] },
            create: { jobId: path[1], notes: data.notes, tags: data.tags },
            update: { notes: data.notes, tags: data.tags },
          });
      });
      return NextResponse.json({ ok: true });
    }
    if (first === "applications" && path[1] && method === "PATCH") {
      const data = z
        .object({
          status: z.enum(statuses),
          notes: z.string().max(10000),
          url: z.string().max(4000).nullable(),
          appliedAt: z.iso.datetime().nullable(),
          followUpAt: z.iso.datetime().nullable(),
        })
        .strict()
        .parse(await body(req));
      if (data.url && !safeUrl(data.url)) throw new AppError("unsafe_url");
      await db.$transaction(async (tx) => {
        await lock(tx);
        const old = await tx.application.findUnique({
          where: { jobId: path[1] },
        });
        const app = await tx.application.upsert({
          where: { jobId: path[1] },
          create: { jobId: path[1], ...data },
          update: data,
        });
        if (old?.status !== data.status)
          await tx.applicationEvent.create({
            data: { applicationId: app.id, status: data.status },
          });
      });
      return NextResponse.json({ ok: true });
    }
    if (first === "searches") {
      if (method === "GET")
        return NextResponse.json({
          saved: await db.searchDefinition.findMany({
            orderBy: { createdAt: "desc" },
          }),
          recent: await db.searchRun.findMany({
            orderBy: { fetchedAt: "desc" },
            take: 12,
            include: { _count: { select: { jobs: true } } },
          }),
        });
      if (method === "DELETE" && path[1]) {
        await db.searchDefinition.delete({ where: { id: path[1] } });
        return NextResponse.json({ ok: true });
      }
      if (method === "POST" || method === "PATCH") {
        const data = z
          .object({
            name: z.string().trim().min(1).max(100),
            input: searchInput,
          })
          .strict()
          .parse(await body(req));
        return NextResponse.json(
          method === "POST"
            ? await db.searchDefinition.create({ data })
            : await db.searchDefinition.update({
                where: { id: path[1] },
                data,
              }),
        );
      }
    }
    if (first === "profile") {
      if (method === "GET") return NextResponse.json(await profile());
      if (method === "PUT") {
        const data = profileSchema.parse(await body(req));
        return NextResponse.json(
          await db.profile.upsert({
            where: { id: "owner" },
            create: { id: "owner", ...data },
            update: data,
          }),
        );
      }
      if (method === "DELETE") {
        const data = z
          .object({ confirm: z.literal("DELETE PROFILE") })
          .parse(await body(req));
        if (data.confirm)
          await db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(640913)`;
            await tx.applicationAttempt.deleteMany();
            await tx.aiGeneration.deleteMany();
            await tx.profileVersion.deleteMany();
            await tx.resumeAsset.deleteMany();
            await tx.profile.deleteMany();
          });
        return NextResponse.json({ ok: true });
      }
    }
    if (first === "cv" && method === "POST") {
      if (Number(req.headers.get("content-length") || 0) > 5500000)
        throw new AppError("cv_too_large", 413);
      const bytes = await boundedBody(req, 5500000);
      const form = await new Response(bytes as BodyInit, {
        headers: { "Content-Type": req.headers.get("content-type") || "" },
      }).formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size > 5 * 1024 * 1024)
        throw new AppError("cv_too_large", 413);
      return NextResponse.json({
        text: await extractCv(Buffer.from(await file.arrayBuffer()), file.name),
      });
    }
    if (first === "settings" && method === "PUT") {
      const data = z
        .object({
          allowance: z.number().int().min(1).max(100000),
          budget: z.number().int().min(1).max(100000),
          dailyCap: z.number().int().min(0).max(1000),
          timezone: z
            .string()
            .max(100)
            .refine((v) => {
              try {
                new Intl.DateTimeFormat("en", { timeZone: v });
                return true;
              } catch {
                return false;
              }
            }),
          cacheHours: z.number().min(1).max(720),
          cycleStart: z.iso.datetime(),
          cycleEnd: z.iso.datetime(),
          providerUsed: z.number().int().min(0).max(100000).optional(),
          resumeProvider: z.boolean().optional(),
        })
        .strict()
        .refine(
          (d) =>
            d.budget <= d.allowance &&
            new Date(d.cycleEnd) > new Date(d.cycleStart),
        )
        .parse(await body(req));
      await settings();
      const result = await db.$transaction(async (tx) => {
        await lock(tx);
        const old = await tx.settings.findUniqueOrThrow({
          where: { id: "owner" },
        });
        const { providerUsed, resumeProvider, ...fields } = data;
        const local = await tx.apiRequestLedger.aggregate({
          where: {
            cycleId: new Date(data.cycleStart).toISOString(),
            state: { not: "released" },
          },
          _sum: { units: true },
        });
        const adjustment =
          providerUsed === undefined
            ? old.cycleStart.toISOString() === data.cycleStart
              ? old.adjustment
              : 0
            : providerUsed - (local._sum.units || 0);
        return tx.settings.update({
          where: { id: "owner" },
          data: {
            ...fields,
            adjustment,
            ...(resumeProvider ? { providerPaused: false } : {}),
          },
        });
      });
      return NextResponse.json(result);
    }
    if (first === "export" && method === "GET") {
      const data = {
        exportedAt: new Date().toISOString(),
        profile: await profile(),
        settings: await settings(),
        jobs: await db.job.findMany({ include: jobInclude }),
        searches: await db.searchDefinition.findMany(),
        runs: await db.searchRun.findMany({ include: { jobs: true } }),
        ledger: await db.apiRequestLedger.findMany(),
        intents: await db.fetchIntent.findMany(),
        profileVersions: await db.profileVersion.findMany(),
        resumeVersions: await db.resumeAsset.findMany({
          select: {
            id: true,
            name: true,
            text: true,
            sha256: true,
            isDefault: true,
            createdAt: true,
          },
        }),
        generations: await db.aiGeneration.findMany({
          include: { drafts: true },
        }),
        attempts: await db.applicationAttempt.findMany({
          select: {
            id: true,
            applicationId: true,
            targetUrl: true,
            state: true,
            evidence: true,
            createdAt: true,
          },
        }),
      };
      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition":
            'attachment; filename="jobcompass-export.json"',
        },
      });
    }
    throw new AppError("not_found", 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: "invalid_input",
          message: "Please check the supplied fields.",
        },
        { status: 400 },
      );
    if (error instanceof AppError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    return NextResponse.json(
      {
        error: "database_unavailable",
        message: "Check PostgreSQL is running and migrations are applied.",
      },
      { status: 503 },
    );
  }
}
function scopedHandler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return accountRequest(req, () => handler(req, context));
}
export {
  scopedHandler as GET,
  scopedHandler as POST,
  scopedHandler as PUT,
  scopedHandler as PATCH,
  scopedHandler as DELETE,
};
