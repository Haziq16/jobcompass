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
