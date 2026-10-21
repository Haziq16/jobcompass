import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  boardInput,
  DirectBoardProvider,
  parseBoardResponse,
} from "../src/lib/direct-provider";
import { discover } from "../src/lib/discovery";
import { db } from "../src/lib/db";
import { settings, usage } from "../src/lib/settings";
import { POST } from "../src/app/api/direct-discovery/route";
if (
  process.env.JOBCOMPASS_TEST !== "true" ||
  !process.env.DATABASE_URL?.includes("/jobcompass_test")
)
  throw new Error("Isolated test database required");
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "FetchIntent", "ApiRequestLedger", "SearchRunJob", "SearchRun", "ApplicationEvent", "Application", "SavedJob", "JobSource", "Job", "Settings" CASCADE',
  );
  await settings();
});
after(() => db.$disconnect());
const board = boardInput.parse({
  platform: "greenhouse",
  board: "fixture-company",
  query: "Kotlin",
});
const input = {
  query: "Kotlin",
  country: "zz",
  remoteOnly: false,
  datePosted: "all" as const,
};
const payload = {
  jobs: [
    {
      id: 123,
      title: "Kotlin Engineer",
      absolute_url: "https://job-boards.greenhouse.io/fixture-company/jobs/123",
      location: { name: "Singapore" },
      content: "&lt;p&gt;Build with Kotlin&lt;/p&gt;",
      updated_at: "2026-10-21T00:00:00Z",
    },
  ],
};

test("direct boards validate tokens, normalize source identities, decode text and retain unknown metadata", () => {
  assert.throws(() =>
    boardInput.parse({ platform: "greenhouse", board: "../../secret" }),
  );
  assert.throws(() =>
    boardInput.parse({
      platform: "greenhouse",
      board: "company",
      region: "eu",
    }),
  );
  const [job] = parseBoardResponse(payload, board);
  assert.equal(job.description, "Build with Kotlin");
  assert.equal(job.providerId, "direct:greenhouse:fixture-company:123");
  assert.equal(job.country, null);
  assert.equal(job.remote, null);
  assert.equal(job.publishedAt, null); // updated_at is not a posting date.
  assert.equal(job.salaryMin, null);
  assert.throws(() =>
    parseBoardResponse(
      { jobs: [{ ...payload.jobs[0], absolute_url: "javascript:alert(1)" }] },
      board,
    ),
  );
  assert.throws(() =>
    parseBoardResponse({ jobs: [{ title: "Missing ID" }] }, board),
  );
});

test("Lever supports regional public endpoints, truthful remote metadata and no-credential GET", async () => {
  const config = boardInput.parse({
    platform: "lever",
    board: "fixture",
    region: "eu",
    query: "engineer Singapore",
  });
  let calls = 0;
  const provider = new DirectBoardProvider(config, async (url, options) => {
    calls++;
    assert.equal(url, "https://api.eu.lever.co/v0/postings/fixture?mode=json");
    assert.equal(options?.redirect, "error");
    assert.deepEqual(options?.headers, { Accept: "application/json" });
    return Response.json([
      {
        id: "abc",
        text: "Engineer",
        hostedUrl: "https://jobs.eu.lever.co/fixture/abc",
        categories: { location: "Singapore", commitment: "Full-time" },
        workplaceType: "remote",
        descriptionPlain: "Develop services.",
      },
    ]);
  });
  const result = await provider.search(input);
  assert.equal(calls, 1);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].remote, true);
  assert.equal(result.jobs[0].employmentType, "Full-time");
  assert.equal(result.nextCursor, null);
});

test("direct import caches and deduplicates without consuming or depending on JSearch quota", async () => {
  await db.settings.update({
    where: { id: "owner" },
    data: {
      providerPaused: true,
      budget: 0,
      dailyCap: 0,
      cycleEnd: new Date(0),
    },
  });
  let calls = 0;
  const provider = new DirectBoardProvider(board, async () => {
    calls++;
    return Response.json(payload);
  });
  const first = await discover(input, randomUUID(), false, provider);
  assert.ok(first.run);
  const cached = await discover(input, randomUUID(), false, provider);
  assert.equal(cached.cached, true);
  assert.equal(calls, 1);
  assert.equal((await usage()).monthly, 0);
  assert.equal((await usage()).daily, 0);
  assert.equal(await db.job.count(), 1);
  assert.equal((await db.apiRequestLedger.findFirstOrThrow()).units, 0);
  await assert.rejects(
    discover(input, randomUUID(), true, provider),
    /direct_rate_limit/,
  );
  await db.apiRequestLedger.updateMany({
    data: { createdAt: new Date(Date.now() - 11000) },
  });
  await discover(input, randomUUID(), true, provider);
  assert.equal(calls, 2);
  assert.equal(await db.job.count(), 1);
  assert.equal(await db.jobSource.count(), 1);
  assert.equal(
    (await db.settings.findUniqueOrThrow({ where: { id: "owner" } }))
      .providerPaused,
    true,
  );
});

test("direct failures are bounded, never retried automatically and do not pause JSearch", async () => {
  let calls = 0;
  const provider = new DirectBoardProvider(board, async () => {
    calls++;
    return new Response("rate limited", { status: 429 });
  });
  const key = randomUUID();
  await assert.rejects(
    discover(input, key, false, provider),
    /direct_rate_limit/,
  );
  await assert.rejects(
    discover(input, key, false, provider),
    /direct_rate_limit/,
  );
  assert.equal(calls, 1);
  assert.equal(await db.job.count(), 0);
  assert.equal(
    (await db.settings.findUniqueOrThrow({ where: { id: "owner" } }))
      .providerPaused,
    false,
  );
  assert.equal((await usage()).monthly, 0);
  const malformed = new DirectBoardProvider(board, async () =>
    Response.json({ surprise: [] }),
  );
  await assert.rejects(malformed.search(input), /malformed_response/);
  const missing = new DirectBoardProvider(
    board,
    async () => new Response(null, { status: 404 }),
  );
  await assert.rejects(missing.search(input), /board_not_found/);
});

test("direct imports protect owner access and reject cross-origin writes before any dispatch", async () => {
  const response = await POST(
    new NextRequest("http://localhost:3000/api/direct-discovery", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "https://untrusted.example" },
      body: JSON.stringify({ input: board, key: randomUUID() }),
    }),
  );
  assert.equal(response.status, 403);
  const old = process.env.APP_ACCESS,
    oldUrl = process.env.APP_URL,
    oldEmail = process.env.OWNER_EMAIL,
    oldSecret = process.env.BETTER_AUTH_SECRET;
  process.env.APP_ACCESS = "hosted";
  process.env.APP_URL = "https://owner.example.test";
  process.env.OWNER_EMAIL = "owner@example.test";
  process.env.BETTER_AUTH_SECRET =
    "test-only-secret-with-more-than-thirty-two-characters";
  try {
    const denied = await POST(
      new NextRequest("https://owner.example.test/api/direct-discovery", {
        method: "POST",
        headers: {
          host: "owner.example.test",
          origin: "https://owner.example.test",
        },
        body: JSON.stringify({ input: board, key: randomUUID() }),
      }),
    );
    assert.equal(denied.status, 401);
  } finally {
    if (old === undefined) delete process.env.APP_ACCESS;
    else process.env.APP_ACCESS = old;
    if (oldUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = oldUrl;
    if (oldEmail === undefined) delete process.env.OWNER_EMAIL;
    else process.env.OWNER_EMAIL = oldEmail;
    if (oldSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = oldSecret;
  }
  assert.equal(await db.apiRequestLedger.count(), 0);
});
