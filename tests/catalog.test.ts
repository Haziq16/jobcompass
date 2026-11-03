import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { authDb, db } from "../src/lib/db";
import { inWorkspace } from "../src/lib/workspace-context";
import { catalogBoards, boardUrl } from "../src/lib/catalog-boards";
import { parseCatalog, fetchCatalogBoard } from "../src/lib/catalog-provider";
import {
  seedCatalog,
  publishCatalogBoard,
  listCatalog,
  refreshCatalog,
  saveCatalogJob,
} from "../src/lib/catalog";
import { GET as catalogGet } from "../src/app/api/catalog/route";
import { POST as catalogSave } from "../src/app/api/catalog/[id]/route";
import { catalogSkillKeys } from "../src/lib/catalog-skill-signals";
import {
  seedCatalogCandidates,
  expandCatalog,
} from "../src/lib/catalog-expansion";
import {
  GET as scheduledRefresh,
  POST as browsingRefresh,
} from "../src/app/api/catalog/refresh/route";
if (
  process.env.JOBCOMPASS_TEST !== "true" ||
  !process.env.DATABASE_URL?.includes("/jobcompass_test")
)
  throw new Error("Test database only");
const fixture = {
  id: "greenhouse:fixture",
  platform: "greenhouse" as const,
  token: "fixture",
  name: "Fixture Company",
};
const rawJob = (id: number, title = "Engineer") => ({
  id,
  title,
  absolute_url: `https://jobs.example/${id}`,
  location: { name: "London, UK" },
  content: "Build distributed services with TypeScript",
  updated_at: new Date().toISOString(),
});
const parse = (jobs: ReturnType<typeof rawJob>[]) =>
  parseCatalog({ jobs }, fixture);
beforeEach(async () => {
  process.env.APP_ACCESS = "local";
  await authDb.$executeRawUnsafe(
    'TRUNCATE TABLE "CatalogBoard", "CatalogJob", "CatalogSync", "Job", "Profile", "Settings" CASCADE',
  );
  await seedCatalog();
  await authDb.catalogBoard.updateMany({ data: { enabled: false } });
  await authDb.catalogBoard.create({ data: fixture });
});
after(() => db.$disconnect());

test("derived mention keys preserve punctuation, overlapping skills and non-Latin boundaries", () => {
  const keys = catalogSkillKeys(
    "JavaScript, React Native, Kotlin开发 and C++.",
  );
  assert.ok(keys.includes("javascript"));
  assert.ok(!keys.includes("java"));
  assert.ok(keys.includes("react") && keys.includes("react native"));
  assert.ok(keys.includes("kotlin") && keys.includes("c++"));
  assert.ok(!catalogSkillKeys("JavaScript alone").includes("java"));
});

test("cached and legacy recommendation rows rank consistently and cache-only updates preserve content time", async () => {
  const jobs = parse([
    {
      ...rawJob(801, "Role one"),
      content: "JavaScript React Native QuantumFlux",
    },
    { ...rawJob(802, "Role two"), content: "Java only" },
  ]);
  await publishCatalogBoard(fixture.id, jobs);
  await inWorkspace("signals", () =>
    db.profile.create({
      data: { skills: ["JavaScript", "React Native", "QuantumFlux"] },
    }),
  );
  const warm = await inWorkspace("signals", () =>
    listCatalog(new URLSearchParams("forYou=true")),
  );
  assert.equal(warm.jobs[0].id, jobs[0].id);
  const before = await authDb.catalogJob.findUniqueOrThrow({
    where: { id: jobs[0].id },
  });
  await authDb.$executeRaw`UPDATE "CatalogJob" SET "skillKeysVersion"=0,"skillKeys"=ARRAY[]::text[]`;
  const cold = await inWorkspace("signals", () =>
    listCatalog(new URLSearchParams("forYou=true")),
  );
  assert.deepEqual(
    cold.jobs.map((j) => j.id),
    warm.jobs.map((j) => j.id),
  );
  await publishCatalogBoard(fixture.id, jobs);
  const after = await authDb.catalogJob.findUniqueOrThrow({
    where: { id: jobs[0].id },
  });
  assert.equal(after.lastChangedAt.valueOf(), before.lastChangedAt.valueOf());
  assert.equal(after.skillKeysVersion, 1);
  assert.ok(after.skillKeys.includes("javascript"));
  assert.equal(after.skillKeysHash, after.hash);
  // A request served by an older deployment may change public content without
  // updating its derived keys. Such a row must use exact fallback checks.
  await authDb.$executeRaw`UPDATE "CatalogJob" SET "searchText"='Java only',hash='changed-public-content' WHERE id=${jobs[0].id}`;
  await authDb.$executeRaw`UPDATE "CatalogJob" SET "searchText"='React Native',hash='changed-second-content' WHERE id=${jobs[1].id}`;
  const changed = await inWorkspace("signals", () =>
    listCatalog(new URLSearchParams("forYou=true")),
  );
  assert.equal(changed.jobs[0].id, jobs[1].id);
  assert.ok(
    !changed.jobs
      .find((j) => j.id === jobs[0].id)
      ?.recommendation.skills.includes("JavaScript"),
  );
});

test("additional public adapters validate full snapshots, preserve unknowns and regional identity", async () => {
  const work = parseCatalog(
    {
      jobs: [
        {
          shortcode: "one",
          title: "Support engineer",
          url: "https://apply.workable.com/example/j/one",
          description: "<p>Customer support</p>",
          published_on: "2026-10-21",
          country: "Greece",
          telecommuting: true,
        },
      ],
    },
    { platform: "workable", token: "example", name: "Example" },
  )[0];
  assert.equal(work.remote, true);
  assert.equal(work.country, "Greece");
  assert.equal(work.description, "Customer support");
  assert.equal(work.publishedAt, "2026-10-21T00:00:00.000Z");
  const rec = parseCatalog(
    {
      offers: [
        {
          id: 1,
          title: "Analyst",
          careers_url: "https://example.recruitee.com/o/analyst",
          created_at: "2026-01-01",
          description: "<p>Analysis</p>",
          requirements: "SQL",
          salary: { min: "100", max: "200", currency: "EUR", period: "hour" },
        },
      ],
    },
    { platform: "recruitee", token: "example", name: "Example" },
  )[0];
  assert.equal(rec.publishedAt, null);
  assert.equal(rec.remote, null);
  assert.ok(rec.description?.includes("SQL"));
  assert.equal(rec.salaryText, "100 - 200 EUR hour");
  assert.throws(() =>
    parseCatalog(
      {
        offers: [
          { id: 1, title: "Unsafe", careers_url: "http://127.0.0.1/private" },
        ],
      },
      { platform: "recruitee", token: "example", name: "Example" },
    ),
  );
  for (const platform of ["workable", "recruitee", "lever-eu"] as const) {
    assert.throws(() =>
      boardUrl({ platform, token: "x.example/../private", name: "Unsafe" }),
    );
  }
  assert.equal(
    new URL(
      boardUrl({ platform: "lever-eu", token: "example", name: "Example" }),
    ).hostname,
    "api.eu.lever.co",
  );
  await assert.rejects(
    fetchCatalogBoard(
      { platform: "workable", token: "example", name: "Example" },
      async () => Response.json({ error: "not_found" }),
    ),
  );
});

test("candidate registry is idempotent, disabled by default and never overwrites existing enabled boards", async () => {
  await seedCatalogCandidates();
  await seedCatalogCandidates();
  assert.ok(
    (await authDb.catalogBoard.count({ where: { enabled: false } })) > 19000,
  );
  assert.equal(
    (await authDb.catalogBoard.findUniqueOrThrow({ where: { id: fixture.id } }))
      .enabled,
    true,
  );
  assert.equal(await authDb.catalogJob.count(), 0);
  assert.equal(
    await authDb.catalogSync.count({
      where: { id: { startsWith: "candidate-seed:" } },
    }),
    1,
  );
});

test("candidate validation activates atomically, coalesces runs and does not consume paid units", async () => {
  await authDb.catalogBoard.create({
    data: {
      id: "greenhouse:expansionfixture",
      platform: "greenhouse",
      token: "expansionfixture",
      name: "Expansion fixture",
      enabled: false,
      nextFetchAt: new Date(0),
    },
  });
  await authDb.catalogBoard.create({
    data: {
      id: "greenhouse:secondexpansion",
      platform: "greenhouse",
      token: "secondexpansion",
      name: "Second fixture",
      enabled: false,
      nextFetchAt: new Date(0),
    },
  });
  let concurrent = 0,
    peak = 0;
  const first = await expandCatalog({
    maxBoards: 2,
    request: async () => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 100));
      concurrent--;
      return Response.json({ jobs: [rawJob(901)] });
    },
  });
  assert.equal(first.activated, 2, JSON.stringify(first));
  assert.equal(first.added, 2);
  assert.equal(peak, 2);
  const board = await authDb.catalogBoard.findUniqueOrThrow({
    where: { id: "greenhouse:expansionfixture" },
  });
  assert.equal(board.enabled, true);
  assert.ok(board.initialIndexedAt);
  assert.equal(board.jobCount, 1);
  const second = await expandCatalog({
    request: async () => {
      throw new Error("Must not fetch");
    },
  });
  assert.equal(second.status, "already_current");
  assert.equal(await authDb.apiRequestLedger.count(), 0);
});

test("oversized expansion is deferred without publishing jobs or disabling normal refresh", async () => {
  const previous = process.env.CATALOG_DATABASE_BUDGET_MB;
  process.env.CATALOG_DATABASE_BUDGET_MB = "32";
  try {
    await authDb.catalogBoard.create({
      data: {
        id: "greenhouse:expansionfixture",
        platform: "greenhouse",
        token: "expansionfixture",
        name: "Expansion fixture",
        enabled: false,
        nextFetchAt: new Date(0),
      },
    });
    const result = await expandCatalog({
      maxBoards: 1,
      request: async () =>
        Response.json({
          jobs: Array.from({ length: 500 }, (_, i) => ({
            ...rawJob(i + 1000),
            content: "x".repeat(30000),
          })),
        }),
    });
    assert.ok(
      result.status === "capacity_paused" ||
        ("deferred" in result && Number(result.deferred) > 0),
      JSON.stringify(result),
    );
    assert.equal(result.activated, 0);
    assert.equal(await authDb.catalogJob.count(), 0);
    assert.equal(
      (
        await authDb.catalogBoard.findUniqueOrThrow({
          where: { id: fixture.id },
        })
      ).enabled,
      true,
    );
    assert.equal(
      (
        await authDb.catalogBoard.findUniqueOrThrow({
          where: { id: "greenhouse:expansionfixture" },
        })
      ).enabled,
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.CATALOG_DATABASE_BUDGET_MB;
    else process.env.CATALOG_DATABASE_BUDGET_MB = previous;
  }
});
test("catalogue source normalisation keeps true dates, excludes unlisted roles and fixes upstream hosts", async () => {
  for (const [platform, token, name] of catalogBoards) {
    const url = new URL(boardUrl({ platform, token, name }));
    assert.ok(
      ["boards-api.greenhouse.io", "api.lever.co", "api.ashbyhq.com"].includes(
        url.hostname,
      ),
    );
  }
  assert.throws(() => boardUrl({ ...fixture, token: "../../secret" }));
  const gh = parse([rawJob(1)])[0];
  assert.equal(gh.publishedAt, null);
  const ashbyBoard = {
    platform: "ashby" as const,
    token: "fixture",
    name: "Example",
  };
  const job = {
    id: "posted",
    title: "Designer",
    location: "Remote",
    isListed: true,
    isRemote: true,
    jobUrl: "https://jobs.ashbyhq.com/fixture/posted",
    applyUrl: "https://jobs.ashbyhq.com/fixture/posted/application",
    publishedAt: "2026-10-20T12:00:00Z",
  };
  const parsed = parseCatalog(
    { jobs: [job, { ...job, id: "unlisted", isListed: false }] },
    ashbyBoard,
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].publishedAt, "2026-10-20T12:00:00.000Z");
  assert.equal(parsed[0].remote, true);
  assert.throws(() =>
    parseCatalog(
      { jobs: [{ ...job, applyUrl: "javascript:alert(1)" }] },
      ashbyBoard,
    ),
  );
  let calls = 0;
  const notModified = await fetchCatalogBoard(
    { ...fixture, etag: '"fixture-tag"' },
    async (url, options) => {
      calls++;
      assert.equal(new URL(String(url)).hostname, "boards-api.greenhouse.io");
      assert.equal(options?.redirect, "error");
      assert.equal(
        (options?.headers as Record<string, string>)["If-None-Match"],
        '"fixture-tag"',
      );
      return new Response(null, { status: 304 });
    },
  );
  assert.equal(notModified.unchanged, true);
  assert.equal(calls, 1);
  await assert.rejects(
    fetchCatalogBoard(fixture, async () =>
      Response.json({ jobs: [rawJob(1)], meta: { total: 2 } }),
    ),
    /incomplete_source/,
  );
});
test("catalogue handles thousands with database pagination, keyword/location filters and honest freshness", async () => {
  const jobs = parse(
    Array.from({ length: 3005 }, (_, i) =>
      rawJob(i + 1, i === 42 ? "Rare Kotlin Architect" : "Platform Engineer"),
    ),
  );
  await publishCatalogBoard(fixture.id, jobs);
  const result = await inWorkspace("alice", () =>
    listCatalog(new URLSearchParams("page=101&sort=found")),
  );
  assert.equal(result.total, 3005);
  assert.equal(result.pages, 101);
  assert.equal(result.jobs.length, 5);
  assert.equal(result.stats.total, 3005);
  const filtered = await inWorkspace("alice", () =>
    listCatalog(new URLSearchParams("q=Kotlin&location=London")),
  );
  assert.equal(filtered.total, 1);
  assert.equal(filtered.jobs[0].title, "Rare Kotlin Architect");
  const unknownDates = await inWorkspace("alice", () =>
    listCatalog(new URLSearchParams("since=24h")),
  );
  assert.equal(unknownDates.total, 0);
  const baseline = await inWorkspace("alice", () =>
    listCatalog(new URLSearchParams("since=24h&freshness=found")),
  );
  assert.equal(baseline.total, 0);
  const attack = await inWorkspace("alice", () =>
    listCatalog(new URLSearchParams({ q: "' OR 1=1 --", location: "%" })),
  );
  assert.equal(attack.total, 0);
});
test("complete snapshots close missing roles and mark genuine new arrivals without rewriting unchanged jobs", async () => {
  const initial = parse([rawJob(1), rawJob(2)]);
  const then = new Date(Date.now() - 10 * 60_000);
  await publishCatalogBoard(fixture.id, initial, then);
  await publishCatalogBoard(fixture.id, parse([rawJob(1), rawJob(3)]));
  const old = await authDb.catalogJob.findUniqueOrThrow({
    where: { id: initial[0].id },
  });
  assert.equal(old.firstSeen.valueOf(), then.valueOf());
  assert.equal(old.lastChangedAt.valueOf(), then.valueOf());
  assert.equal(
    (
      await authDb.catalogJob.findUniqueOrThrow({
        where: { id: initial[1].id },
      })
    ).active,
    false,
  );
  const recent = await inWorkspace("alice", () =>
    listCatalog(new URLSearchParams("since=24h&freshness=found")),
  );
  assert.equal(recent.total, 1);
  assert.equal(recent.jobs[0].discoveredAfterBaseline, true);
});
test("shared refresh leases coalesce concurrent calls; source failure retains jobs and backs off", async () => {
  let calls = 0;
  const upstream: typeof fetch = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return Response.json({ jobs: [rawJob(1)] });
  };
  const results = await Promise.all([
    refreshCatalog(upstream),
    refreshCatalog(upstream),
  ]);
  assert.equal(calls, 1);
  assert.equal(results.filter((r) => r.status === "already_current").length, 1);
  await authDb.catalogSync.update({
    where: { id: "global" },
    data: { nextRunAt: new Date(0) },
  });
  await authDb.catalogBoard.update({
    where: { id: fixture.id },
    data: { nextFetchAt: new Date(0) },
  });
  const failed = await refreshCatalog(
    async () => new Response(null, { status: 503 }),
  );
  assert.equal(failed.failed, 1);
  assert.equal(await authDb.catalogJob.count({ where: { active: true } }), 1);
  const board = await authDb.catalogBoard.findUniqueOrThrow({
    where: { id: fixture.id },
  });
  assert.ok(board.nextFetchAt.valueOf() > Date.now() + 25 * 60_000);
  await authDb.catalogBoard.update({
    where: { id: fixture.id },
    data: { lastSuccessAt: new Date(Date.now() - 49 * 3600_000) },
  });
  const stale = await inWorkspace("alice", () =>
    listCatalog(new URLSearchParams()),
  );
  assert.equal(stale.total, 0);
});
test("refresh drains multiple oldest-due pages without duplicate requests and retains its shared lease and backoff", async () => {
  await publishCatalogBoard(fixture.id, parse([rawJob(9901)]));
  const stale = new Date(Date.now() - 49 * 3600_000);
  await authDb.catalogBoard.update({
    where: { id: fixture.id },
    data: { nextFetchAt: new Date(0), lastSuccessAt: stale, failures: 2 },
  });
  await authDb.catalogBoard.createMany({
    data: Array.from({ length: 244 }, (_, index) => ({
      id: "greenhouse:page" + String(index).padStart(3, "0"),
      token: "page" + String(index).padStart(3, "0"),
      platform: "greenhouse",
      name: "Paged fixture " + index,
      initialIndexedAt: stale,
      lastSuccessAt: stale,
      nextFetchAt: new Date((index + 1) * 1000),
      jobCount: 1,
    })),
  });
  const calls = new Set<string>();
  let active = 0,
    peak = 0;
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let firstEntered!: () => void;
  const entered = new Promise<void>((resolve) => {
    firstEntered = resolve;
  });
  const running = refreshCatalog(async (url) => {
    const token = new URL(String(url)).pathname.split("/").at(-2)!;
    assert.ok(!calls.has(token), "A board was requested twice in one refresh");
    calls.add(token);
    active++;
    peak = Math.max(peak, active);
    if (calls.size === 1) {
      firstEntered();
      await gate;
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return new Response(null, { status: token === fixture.token ? 503 : 304 });
  });
  let result;
  try {
    await Promise.race([entered, running]);
    const overlap = await refreshCatalog(async () => {
      throw new Error("Concurrent refresh must not fetch");
    });
    assert.equal(overlap.status, "already_current");
    const held = await authDb.catalogSync.findUniqueOrThrow({
      where: { id: "global" },
    });
    assert.ok(held.leaseUntil.valueOf() > Date.now());
  } finally {
    releaseFirst();
    result = await running;
  }
  assert.deepEqual(result, {
    status: "completed",
    checked: 245,
    succeeded: 244,
    failed: 1,
  });
  assert.equal(calls.size, 245);
  assert.equal(peak, 4);
  assert.equal(await authDb.catalogJob.count({ where: { active: true } }), 1);
  const failed = await authDb.catalogBoard.findUniqueOrThrow({
    where: { id: fixture.id },
  });
  assert.equal(failed.failures, 3);
  assert.ok(failed.nextFetchAt.valueOf() > Date.now() + 119 * 60000);
  assert.equal(
    await authDb.catalogBoard.count({
      where: { enabled: true, lastSuccessAt: { gt: stale } },
    }),
    244,
  );
  const finished = await authDb.catalogSync.findUniqueOrThrow({
    where: { id: "global" },
  });
  assert.ok(finished.leaseUntil.valueOf() <= Date.now());
  assert.ok(finished.nextRunAt.valueOf() > Date.now());
});

test("refresh stops new work at its deadline and the next lease resumes untouched due boards", async (t) => {
  await authDb.catalogBoard.updateMany({ data: { enabled: false } });
  const baseline = new Date(Date.now() - 49 * 3600_000);
  await authDb.catalogBoard.createMany({
    data: Array.from({ length: 245 }, (_, index) => ({
      id: "greenhouse:deadline" + String(index).padStart(3, "0"),
      token: "deadline" + String(index).padStart(3, "0"),
      platform: "greenhouse",
      name: "Deadline fixture " + index,
      initialIndexedAt: baseline,
      lastSuccessAt: baseline,
      nextFetchAt: new Date(0),
      jobCount: 1,
    })),
  });
  const first = new Set<string>();
  const actualNow = Date.now;
  let elapsed = 0;
  t.mock.method(Date, "now", () => actualNow() + elapsed);
  let interrupted;
  try {
    interrupted = await refreshCatalog(async (url) => {
      first.add(String(url));
      if (first.size === 125) elapsed = 160001;
      return new Response(null, { status: 304 });
    });
  } finally {
    t.mock.restoreAll();
  }
  assert.ok(interrupted.checked >= 125 && interrupted.checked <= 128);
  assert.equal(interrupted.checked, first.size);
  assert.equal(interrupted.failed, 0);
  assert.equal(
    await authDb.catalogBoard.count({
      where: { enabled: true, lastAttemptAt: null },
    }),
    245 - first.size,
  );
  await authDb.catalogSync.update({
    where: { id: "global" },
    data: { nextRunAt: new Date(0) },
  });
  const second = new Set<string>();
  const resumed = await refreshCatalog(async (url) => {
    assert.ok(
      !first.has(String(url)),
      "Already checked boards should retain their next-fetch interval",
    );
    second.add(String(url));
    return new Response(null, { status: 304 });
  });
  assert.equal(resumed.checked, 245 - first.size);
  assert.equal(resumed.succeeded, second.size);
  assert.equal(first.size + second.size, 245);
  assert.equal(
    await authDb.catalogBoard.count({
      where: { enabled: true, lastSuccessAt: { lte: baseline } },
    }),
    0,
  );
});

test("catalogue saving is idempotent and makes independent private copies without leaking notes", async () => {
  const [job] = parse([rawJob(1)]);
  await publishCatalogBoard(fixture.id, [job]);
  const alice = await inWorkspace("alice", () => saveCatalogJob(job.id));
  const again = await inWorkspace("alice", () => saveCatalogJob(job.id));
  assert.equal(alice.jobId, again.jobId);
  await inWorkspace("alice", () =>
    db.savedJob.update({
      where: { jobId: alice.jobId },
      data: { notes: "Private Alice note" },
    }),
  );
  const bobView = await inWorkspace("bob", () =>
    listCatalog(new URLSearchParams()),
  );
  assert.equal(bobView.jobs[0].saved, false);
  const bob = await inWorkspace("bob", () => saveCatalogJob(job.id));
  assert.notEqual(alice.jobId, bob.jobId);
  assert.equal(
    (
      await inWorkspace("bob", () =>
        db.savedJob.findUniqueOrThrow({ where: { jobId: bob.jobId } }),
      )
    ).notes,
    "",
  );
  await publishCatalogBoard(fixture.id, []);
  await assert.rejects(
    inWorkspace("carol", () => saveCatalogJob(job.id)),
    /listing_unavailable/,
  );
  assert.equal(
    (
      await inWorkspace("alice", () =>
        db.savedJob.findUniqueOrThrow({ where: { jobId: alice.jobId } }),
      )
    ).notes,
    "Private Alice note",
  );
  assert.equal(await authDb.catalogJob.count(), 1);
});
test("discovery APIs reject anonymous access, cross-origin saves and invalid scheduler credentials", async () => {
  const env = {
    APP_ACCESS: process.env.APP_ACCESS,
    APP_URL: process.env.APP_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    PUBLIC_SIGNUP: process.env.PUBLIC_SIGNUP,
  };
  try {
    process.env.APP_ACCESS = "hosted";
    process.env.APP_URL = "https://catalog.example";
    process.env.PUBLIC_SIGNUP = "true";
    process.env.BETTER_AUTH_SECRET = "catalogue-test-secret-with-32-characters";
    const req = new Request("https://catalog.example/api/catalog", {
      headers: { host: "catalog.example" },
    });
    assert.equal((await catalogGet(req)).status, 401);
    assert.equal(
      (
        await browsingRefresh(
          new Request(req.url, {
            method: "POST",
            headers: {
              host: "catalog.example",
              origin: "https://catalog.example",
            },
          }),
        )
      ).status,
      401,
    );
    const bad = new Request(req.url, {
      method: "POST",
      headers: { host: "catalog.example", origin: "https://attacker.example" },
    });
    assert.equal(
      (
        await catalogSave(bad, {
          params: Promise.resolve({ id: "a".repeat(64) }),
        })
      ).status,
      403,
    );
    assert.equal((await scheduledRefresh(req)).status, 401);
    assert.equal(await authDb.catalogSync.count(), 0);
  } finally {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
