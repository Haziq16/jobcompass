import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { db } from "../src/lib/db";
import { discover, fingerprint } from "../src/lib/discovery";
import { settings, usage } from "../src/lib/settings";
import {
  searchInput,
  AppError,
  safeUrl,
  normalizedUrl,
  type JobProvider,
} from "../src/lib/contracts";
import { parseResponse } from "../src/lib/provider";
import { matchJob, hasTerm } from "../src/lib/matching";
import { accessAllowed } from "../src/lib/access";
import { extractCv } from "../src/lib/cv";
import JSZip from "jszip";
import { createOwnerAuth } from "../src/lib/auth";
import { authorize } from "../src/lib/authorization";
import { NextRequest } from "next/server";
import { GET, POST, PUT, PATCH } from "../src/app/api/[...path]/route";
const fixture = JSON.parse(
  readFileSync("tests/fixtures/search-v2.json", "utf8"),
);
const input = searchInput.parse({
  query: "Android developer in Malaysia",
  country: "MY",
});
if (
  process.env.JOBCOMPASS_TEST !== "true" ||
  !process.env.DATABASE_URL?.includes("/jobcompass_test")
)
  throw new Error(
    "Integration tests require isolated jobcompass_test database.",
  );
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Session", "Account", "User", "Verification", "RateLimit", "FetchIntent", "ApiRequestLedger", "SearchRunJob", "SearchRun", "ApplicationEvent", "Application", "SavedJob", "JobSource", "Job", "SearchDefinition", "Profile", "Settings" CASCADE',
  );
  await settings();
});
after(() => db.$disconnect());
function request(path: string, method = "GET", data?: unknown) {
  return new NextRequest("http://localhost:3000/api/" + path, {
    method,
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    body: data ? JSON.stringify(data) : undefined,
  });
}
function context(path: string) {
  return { params: Promise.resolve({ path: path.split("?")[0].split("/") }) };
}
test("hosted owner sessions protect every private API, registration stays closed and sign-in is rate limited", async () => {
  const keys = [
    "APP_ACCESS",
    "APP_URL",
    "OWNER_EMAIL",
    "BETTER_AUTH_SECRET",
    "VERCEL",
  ] as const;
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    APP_ACCESS: "hosted",
    APP_URL: "https://owner.example.test",
    OWNER_EMAIL: "owner@example.test",
    BETTER_AUTH_SECRET: "test-only-secret-with-more-than-thirty-two-characters",
  });
  try {
    const headers = new Headers({
      host: "owner.example.test",
      origin: "https://owner.example.test",
    });
    await assert.rejects(authorize(headers, "GET"), /unauthenticated/);
    const unauthenticated = new NextRequest(
      "https://owner.example.test/api/discovery/search",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ input, key: randomUUID() }),
      },
    );
    assert.equal(
      (await POST(unauthenticated, context("discovery/search"))).status,
      401,
    );
    assert.equal(await db.apiRequestLedger.count(), 0);
    const password = "Test owner password 123!";
    await createOwnerAuth(true).api.signUpEmail({
      body: { email: "owner@example.test", password, name: "Test owner" },
    });
    await assert.rejects(
      createOwnerAuth(true).api.signUpEmail({
        body: { email: "intruder@example.test", password, name: "Other user" },
      }),
    );
    const auth = createOwnerAuth();
    const authRequest = (endpoint: string, body: unknown) =>
      new Request("https://owner.example.test/api/auth/" + endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "https://owner.example.test",
          "x-vercel-forwarded-for": "192.0.2.20",
        },
        body: JSON.stringify(body),
      });
    assert.ok(
      (
        await auth.handler(
          authRequest("sign-up/email", {
            email: "other@example.test",
            password,
            name: "Other",
          }),
        )
      ).status >= 400,
    );
    const signedIn = await auth.handler(
      authRequest("sign-in/email", { email: "owner@example.test", password }),
    );
    assert.equal(signedIn.status, 200);
    const cookies = signedIn.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    assert.ok(cookies.includes("session_token"));
    headers.set("cookie", cookies);
    assert.equal(
      (await authorize(headers, "GET"))?.user.email,
      "owner@example.test",
    );
    const jobs = await GET(
      new NextRequest("https://owner.example.test/api/jobs", { headers }),
      context("jobs"),
    );
    assert.equal(jobs.status, 200);
    const csrf = new Headers(headers);
    csrf.set("origin", "https://attacker.example");
    await assert.rejects(authorize(csrf, "POST"), /forbidden/);
    for (let i = 0; i < 6; i++) {
      const response = await auth.handler(
        authRequest("sign-in/email", {
          email: "owner@example.test",
          password: "wrong password",
        }),
      );
      if (i === 5) assert.equal(response.status, 429);
    }
    assert.ok(await db.rateLimit.count());
    await db.session.deleteMany();
    await assert.rejects(authorize(headers, "GET"), /unauthenticated/);
  } finally {
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
});
test("API persists reviewed profile, saved searches, notes, application events and exports without spending", async () => {
  const profile = {
    skills: ["Kotlin"],
    titles: ["Android Developer"],
    locations: ["Malaysia"],
    excluded: [],
    years: 2,
    arrangement: "any",
    cvText: "Reviewed fictional CV",
    aliases: {},
  };
  assert.equal(
    (await PUT(request("profile", "PUT", profile), context("profile"))).status,
    200,
  );
  assert.equal(
    (
      await POST(
        request("searches", "POST", { name: "Android", input }),
        context("searches"),
      )
    ).status,
    200,
  );
  const p = provider();
  await discover(input, randomUUID(), false, p.mock);
  const job = await db.job.findFirstOrThrow();
  assert.equal(
    (
      await PATCH(
        request("jobs/" + job.id, "PATCH", {
          saved: true,
          notes: "Portfolio fit",
          tags: ["Priority"],
        }),
        context("jobs/" + job.id),
      )
    ).status,
    200,
  );
  const application = {
    status: "Applied",
    notes: "Manual application",
    url: "https://example.org/apply",
    appliedAt: new Date().toISOString(),
    followUpAt: null,
  };
  assert.equal(
    (
      await PATCH(
        request("applications/" + job.id, "PATCH", application),
        context("applications/" + job.id),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await PATCH(
        request("applications/" + job.id, "PATCH", {
          ...application,
          status: "Interview",
        }),
        context("applications/" + job.id),
      )
    ).status,
    200,
  );
  const detail = await GET(
    request("jobs/" + job.id),
    context("jobs/" + job.id),
  );
  const value = await detail.json();
  assert.equal(value.application.events.length, 2);
  assert.equal(value.saved.notes, "Portfolio fit");
  const filtered = await GET(
    request("jobs?saved=true&q=Portfolio"),
    context("jobs"),
  );
  assert.equal((await filtered.json()).total, 1);
  const exported = await GET(request("export"), context("export"));
  assert.equal((await exported.json()).profile.cvText, "Reviewed fictional CV");
  assert.equal(p.calls, 1);
  assert.equal((await usage()).monthly, 1);
});
test("API blocks remote data reads, validates every write, and keeps disconnected discovery free", async () => {
  const denied = await GET(
    new NextRequest("https://public.example/api/jobs", {
      headers: { host: "public.example" },
    }),
    context("jobs"),
  );
  assert.equal(denied.status, 403);
  assert.equal(
    (
      await PUT(
        request("profile", "PUT", { skills: "invalid" }),
        context("profile"),
      )
    ).status,
    400,
  );
  const discovery = await POST(
    request("discovery/search", "POST", {
      input,
      key: randomUUID(),
      refresh: false,
    }),
    context("discovery/search"),
  );
  assert.equal(discovery.status, 503);
  assert.equal(await db.apiRequestLedger.count(), 0);
});
test("provider quota responses persist a discovery pause until explicit owner reconciliation", async () => {
  const limited: JobProvider = {
    async search() {
      throw new AppError("provider_quota", 502, 429);
    },
  };
  await assert.rejects(
    discover(input, randomUUID(), true, limited),
    /provider_quota/,
  );
  assert.equal((await settings()).providerPaused, true);
  const p = provider();
  await assert.rejects(
    discover(
      { ...input, query: "Other role in Malaysia" },
      randomUUID(),
      false,
      p.mock,
    ),
    /provider_paused/,
  );
  assert.equal(p.calls, 0);
  const s = await settings();
  const payload = {
    allowance: s.allowance,
    budget: s.budget,
    dailyCap: s.dailyCap,
    cacheHours: s.cacheHours,
    timezone: s.timezone,
    cycleStart: s.cycleStart.toISOString(),
    cycleEnd: s.cycleEnd.toISOString(),
    providerUsed: 10,
    resumeProvider: true,
  };
  assert.equal(
    (await PUT(request("settings", "PUT", payload), context("settings")))
      .status,
    200,
  );
  assert.equal((await usage()).monthly, 10);
  assert.equal((await settings()).providerPaused, false);
  await discover(input, randomUUID(), true, p.mock);
  assert.equal((await usage()).monthly, 11);
});
function provider(delay = 0) {
  let calls = 0;
  const seen: unknown[] = [];
  const mock: JobProvider = {
    async search(i) {
      calls++;
      seen.push(i);
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return parseResponse(fixture);
    },
  };
  return {
    mock,
    get calls() {
      return calls;
    },
    seen,
  };
}
test("first search persists jobs; fresh cache and idempotency replays use no requests", async () => {
  const p = provider();
  const key = randomUUID();
  const first = await discover(input, key, false, p.mock);
  assert.ok("run" in first && first.run);
  const cached = await discover(input, randomUUID(), false, p.mock);
  assert.ok("cached" in cached && cached.cached);
  await discover(input, key, true, p.mock);
  assert.equal(p.calls, 1);
  assert.equal(await db.job.count(), 2);
  assert.equal((await usage()).monthly, 1);
  const independent = new PrismaClient();
  assert.equal(await independent.job.count(), 2);
  await independent.$disconnect();
});
test("concurrent equivalent fetches coalesce across independent intents", async () => {
  const p = provider();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const mock: JobProvider = {
    search: async (value) => {
      entered.resolve();
      await release.promise;
      return p.mock.search(value);
    },
  };
  const first = discover(input, randomUUID(), true, mock);
  await entered.promise;
  const second = await discover(input, randomUUID(), true, mock);
  release.resolve();
  const results = [await first, second];
  assert.equal(p.calls, 1);
  assert.equal(await db.apiRequestLedger.count(), 1);
  assert.ok(results.some((r) => "pending" in r));
});
test("distinct concurrent searches cannot overspend daily or monthly caps", async () => {
  await db.settings.update({ where: { id: "owner" }, data: { dailyCap: 1 } });
  const p = provider(30);
  const results = await Promise.allSettled([
    discover(input, randomUUID(), true, p.mock),
    discover(
      { ...input, query: "PMO in Malaysia" },
      randomUUID(),
      true,
      p.mock,
    ),
  ]);
  assert.equal(p.calls, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  await db.settings.update({
    where: { id: "owner" },
    data: { dailyCap: 6, budget: 1 },
  });
  await assert.rejects(
    discover(
      { ...input, query: "Another role in Malaysia" },
      randomUUID(),
      true,
      p.mock,
    ),
    /monthly_limit/,
  );
});
test("cursor, country and filter fingerprint separation; explicit next page costs one unit", async () => {
  const p = provider();
  await discover(input, randomUUID(), false, p.mock);
  await discover(
    { ...input, cursor: "next-page-cursor" },
    randomUUID(),
    false,
    p.mock,
  );
  assert.equal(p.calls, 2);
  assert.equal((p.seen[1] as typeof input).cursor, "next-page-cursor");
  assert.notEqual(fingerprint(input), fingerprint({ ...input, country: "sg" }));
  assert.notEqual(
    fingerprint(input),
    fingerprint({ ...input, remoteOnly: true }),
  );
  assert.notEqual(
    fingerprint(input),
    fingerprint({ ...input, datePosted: "week" }),
  );
  assert.equal(await db.job.count(), 2);
});
test("failures retain stored jobs and count sent allowance; replay cannot retry failed call", async () => {
  const p = provider();
  await discover(input, randomUUID(), false, p.mock);
  let failedCalls = 0;
  const bad: JobProvider = {
    async search() {
      failedCalls++;
      throw new AppError("timeout", 502);
    },
  };
  const key = randomUUID();
  await assert.rejects(discover(input, key, true, bad), /timeout/);
  await assert.rejects(discover(input, key, true, bad), /timeout/);
  assert.equal(failedCalls, 1);
  assert.equal(await db.job.count(), 2);
  assert.equal((await usage()).monthly, 2);
  assert.equal(
    await db.apiRequestLedger.count({ where: { state: "uncertain" } }),
    1,
  );
});
test("saved notes, details, matching and application history do not invoke provider", async () => {
  const p = provider();
  await discover(input, randomUUID(), false, p.mock);
  const job = await db.job.findFirstOrThrow();
  await db.savedJob.create({
    data: { jobId: job.id, notes: "Follow up", tags: ["Priority"] },
  });
  const application = await db.application.create({
    data: {
      jobId: job.id,
      status: "Applied",
      events: { create: { status: "Applied" } },
    },
  });
  assert.ok(
    await db.applicationEvent.findFirst({
      where: { applicationId: application.id },
    }),
  );
  assert.equal(
    (
      await db.job.findMany({
        where: { saved: { notes: { contains: "Follow" } } },
      })
    ).length,
    1,
  );
  assert.equal(p.calls, 1);
});
test("normalization validates envelope, sanitizes text, retains safe links and missing nulls", () => {
  const result = parseResponse(fixture);
  assert.equal(result.jobs[0].applyLinks[0].direct, true);
  assert.equal(result.jobs[0].applyLinks.length, 2);
  assert.ok(!result.jobs[0].description?.includes("script"));
  assert.ok(!result.jobs[0].description?.includes("alert"));
  assert.equal(result.jobs[1].remote, null);
  assert.equal(result.jobs[1].publishedAt, null);
  assert.equal(result.jobs[0].salaryCurrency, null);
  assert.throws(() => parseResponse({ status: "OK", data: [] }));
  assert.throws(() =>
    parseResponse({
      status: "OK",
      data: { jobs: [{ job_title: "malformed" }] },
    }),
  );
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(
    normalizedUrl("https://example.org/job?req=100&utm_source=mail"),
    "https://example.org/job?req=100",
  );
});
test("different requisition links stay distinct; conservative related fingerprints never merge", async () => {
  const p = provider();
  await discover(input, randomUUID(), false, p.mock);
  const other = structuredClone(fixture);
  other.data.jobs[0].job_id = "distinct-requisition";
  other.data.jobs[0].job_apply_link = "https://example.com/jobs/2?req=200";
  other.data.jobs[0].apply_options = [];
  const otherProvider: JobProvider = {
    async search() {
      return parseResponse(other);
    },
  };
  await discover(input, randomUUID(), true, otherProvider);
  assert.equal(await db.job.count(), 3);
});
test("Java does not match JavaScript; unknown eligibility has no confirmed points", () => {
  assert.equal(hasTerm("JavaScript developer", "Java"), false);
  assert.equal(hasTerm("Java developer", "Java"), true);
  const job = {
    title: "Developer",
    location: null,
    description: "JavaScript applications",
    qualifications: [],
    remote: true,
  };
  const match = matchJob(job, {
    skills: ["Java"],
    titles: [],
    locations: [],
    excluded: [],
    years: null,
    arrangement: "any",
  });
  assert.equal(match.matched.length, 0);
  assert.equal(match.coverage, 40);
  assert.equal(
    match.categories.find((c) => c.name === "Experience")?.known,
    false,
  );
  assert.ok(match.uncertain.includes("Visa sponsorship"));
});
test("hosted, cross-site and forged-origin requests cannot access data or spend quota", () => {
  const local = new Headers({
    host: "127.0.0.1:3000",
    origin: "http://127.0.0.1:3000",
  });
  assert.equal(accessAllowed(local, "POST", { APP_ACCESS: "local" }), true);
  assert.equal(accessAllowed(local, "GET", { APP_ACCESS: "hosted" }), false);
  assert.equal(
    accessAllowed(new Headers({ host: "public.example" }), "GET", {
      APP_ACCESS: "local",
    }),
    false,
  );
  assert.equal(
    accessAllowed(
      new Headers({
        host: "localhost:3000",
        origin: "https://attacker.example",
      }),
      "POST",
      { APP_ACCESS: "local" },
    ),
    false,
  );
  assert.equal(
    accessAllowed(
      new Headers({ host: "localhost:3000", "sec-fetch-site": "cross-site" }),
      "GET",
      { APP_ACCESS: "local" },
    ),
    false,
  );
});
test("CV validates signatures, bounds and embedded objects; extracts editable text only", async () => {
  await assert.rejects(
    extractCv(Buffer.from("not a pdf"), "cv.pdf"),
    /unsupported_cv/,
  );
  await assert.rejects(
    extractCv(Buffer.alloc(6 * 1024 * 1024), "cv.pdf"),
    /cv_too_large/,
  );
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="urn:test"><w:p><w:r><w:t>Kotlin &amp; Android</w:t></w:r></w:p></w:document>',
  );
  assert.equal(
    await extractCv(await zip.generateAsync({ type: "nodebuffer" }), "cv.docx"),
    "Kotlin & Android",
  );
  zip.file("word/embeddings/object.bin", "unsafe");
  await assert.rejects(
    extractCv(await zip.generateAsync({ type: "nodebuffer" }), "cv.docx"),
    /unsupported_cv/,
  );
});
test("expired cycles block discovery while cached and saved data remain browsable", async () => {
  const p = provider();
  await discover(input, randomUUID(), false, p.mock);
  await db.settings.update({
    where: { id: "owner" },
    data: { cycleEnd: new Date(Date.now() - 1000) },
  });
  await assert.rejects(
    discover(input, randomUUID(), true, p.mock),
    /cycle_expired/,
  );
  const cached = await discover(input, randomUUID(), false, p.mock);
  assert.ok("cached" in cached && cached.cached);
  assert.equal(await db.job.count(), 2);
});
test("reused intent with different input is rejected, interrupted requests stay consumed", async () => {
  const p = provider();
  const key = randomUUID();
  await discover(input, key, false, p.mock);
  await assert.rejects(
    discover({ ...input, country: "sg" }, key, false, p.mock),
    /idempotency_conflict/,
  );
  const s = await settings();
  await db.apiRequestLedger.create({
    data: {
      fingerprint: "interrupted",
      cycleId: s.cycleStart.toISOString(),
      dayKey: "old",
      state: "sent",
      createdAt: new Date(Date.now() - 180000),
      dispatchedAt: new Date(Date.now() - 180000),
    },
  });
  await discover(
    { ...input, query: "PMO role in Malaysia" },
    randomUUID(),
    false,
    p.mock,
  );
  assert.equal(
    await db.apiRequestLedger.count({ where: { state: "uncertain" } }),
    1,
  );
  assert.equal((await usage()).monthly, 3);
});
