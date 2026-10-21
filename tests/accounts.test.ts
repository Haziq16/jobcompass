import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db, authDb } from "../src/lib/db";
import { inWorkspace } from "../src/lib/workspace-context";
import { profile, settings, usage } from "../src/lib/settings";
import { createOwnerAuth } from "../src/lib/auth";
import { GET, PATCH, DELETE } from "../src/app/api/[...path]/route";
import {
  GET as workspaceGet,
  POST as workspacePost,
} from "../src/app/api/workspace/[...path]/route";
import { POST as directPost } from "../src/app/api/direct-discovery/route";
import { DirectBoardProvider, boardInput } from "../src/lib/direct-provider";
import { discover } from "../src/lib/discovery";
if (
  process.env.JOBCOMPASS_TEST !== "true" ||
  !process.env.DATABASE_URL?.includes("/jobcompass_test")
)
  throw new Error("Test database only");
beforeEach(async () => {
  await authDb.$executeRawUnsafe(
    'TRUNCATE TABLE "User", "Job", "Settings", "Profile", "SearchRun", "ApiRequestLedger", "ProfileVersion", "ResumeAsset" CASCADE',
  );
  process.env.APP_ACCESS = "local";
  delete process.env.PUBLIC_SIGNUP;
});
after(() => db.$disconnect());
const ctx = (path: string) => ({
  params: Promise.resolve({ path: path.split("/") }),
});
test("workspace boundaries cover lists, unique reads, mutations, bulk deletes and profile singletons", async () => {
  const job = await inWorkspace("alice", () =>
    db.job.create({
      data: {
        title: "Alice private",
        employer: "Example",
        relatedFingerprint: "same",
      },
    }),
  );
  await inWorkspace("alice", async () => {
    await profile();
    await db.profile.update({
      where: { id: "owner" },
      data: { skills: ["PrivateSkill"] },
    });
    await db.savedJob.create({ data: { jobId: job.id, notes: "Alice note" } });
  });
  await inWorkspace("bob", async () => {
    assert.equal(await db.job.count(), 0);
    assert.equal(await db.job.findUnique({ where: { id: job.id } }), null);
    assert.equal((await profile()).skills.length, 0);
    await assert.rejects(
      db.job.update({ where: { id: job.id }, data: { title: "stolen" } }),
    );
    await assert.rejects(
      db.savedJob.create({ data: { jobId: job.id, notes: "cross-account" } }),
    );
    assert.equal((await db.job.deleteMany()).count, 0);
    const own = await db.job.create({
      data: {
        title: "Bob",
        employer: "Example",
        relatedFingerprint: "same",
        workspaceId: "alice",
      },
    });
    assert.equal(own.workspaceId, "bob");
    await db.job.update({
      where: { id: own.id },
      data: { workspaceId: "alice", title: "Bob edited" },
    });
    assert.equal(
      (await db.job.findUniqueOrThrow({ where: { id: own.id } })).workspaceId,
      "bob",
    );
  });
  await inWorkspace("alice", async () => {
    assert.equal(await db.job.count(), 1);
    assert.equal((await profile()).skills[0], "PrivateSkill");
    assert.equal((await db.savedJob.findFirstOrThrow()).notes, "Alice note");
  });
});
test("identical public-board imports have independent IDs, cache, request keys and quotas per account", async () => {
  const config = boardInput.parse({ platform: "greenhouse", board: "fixture" });
  let calls = 0;
  const provider = new DirectBoardProvider(config, async () => {
    calls++;
    return Response.json({
      jobs: [
        {
          id: 1,
          title: "Engineer",
          absolute_url: "https://job-boards.greenhouse.io/fixture/jobs/1",
        },
      ],
    });
  });
  const input = {
      query: "all",
      country: "zz",
      remoteOnly: false,
      datePosted: "all" as const,
    },
    key = randomUUID();
  await inWorkspace("alice", () => discover(input, key, false, provider));
  await inWorkspace("bob", () => discover(input, key, false, provider));
  assert.equal(calls, 2);
  const alice = await inWorkspace("alice", () => db.job.findFirstOrThrow());
  const bob = await inWorkspace("bob", () => db.job.findFirstOrThrow());
  assert.notEqual(alice.id, bob.id);
  for (const account of ["alice", "bob"])
    await inWorkspace(account, async () => {
      assert.equal(await db.jobSource.count(), 1);
      assert.equal(await db.apiRequestLedger.count(), 1);
      assert.equal((await usage()).monthly, 0);
      await settings();
    });
});
test("concurrent workspace contexts cannot bleed across awaited operations", async () => {
  await Promise.all(
    ["alice", "bob"].map((account) =>
      inWorkspace(account, async () => {
        await new Promise((r) => setTimeout(r, account === "alice" ? 30 : 5));
        await db.job.create({
          data: {
            title: account,
            employer: account,
            relatedFingerprint: account,
          },
        });
        assert.equal((await db.job.findFirstOrThrow()).title, account);
      }),
    ),
  );
});
test("public sign-up, sign-in and session isolation work through actual auth cookies", async () => {
  const old = { ...process.env };
  Object.assign(process.env, {
    APP_ACCESS: "hosted",
    PUBLIC_SIGNUP: "true",
    APP_URL: "https://accounts.example.test",
    BETTER_AUTH_SECRET: "account-test-secret-over-thirty-two-characters",
  });
  const auth = createOwnerAuth();
  const origin = "https://accounts.example.test";
  const cookies: string[] = [];
  const accounts: string[] = [];
  try {
    for (const name of ["Alice", "Bob"]) {
      const response = await auth.handler(
        new Request(origin + "/api/auth/sign-up/email", {
          method: "POST",
          headers: { origin, "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email: `${name.toLowerCase()}@example.test`,
            password: "fixture-only-strong-password-123",
          }),
        }),
      );
      assert.equal(response.status, 200);
      const body = await response.json();
      accounts.push(body.user.id);
      cookies.push(
        response.headers
          .getSetCookie()
          .map((v) => v.split(";")[0])
          .join("; "),
      );
    }
    await inWorkspace(accounts[0], () =>
      db.job.create({
        data: {
          title: "Private Alice job",
          employer: "Example",
          relatedFingerprint: "alice",
        },
      }),
    );
    const headers = {
      host: "accounts.example.test",
      origin,
      cookie: cookies[1],
    };
    const bobJobs = await GET(
      new NextRequest(origin + "/api/jobs", { headers }),
      ctx("jobs"),
    );
    assert.equal(bobJobs.status, 200);
    assert.equal((await bobJobs.json()).total, 0);
    const aliceJob = await inWorkspace(accounts[0], () =>
      db.job.findFirstOrThrow(),
    );
    const hidden = await GET(
      new NextRequest(origin + `/api/jobs/${aliceJob.id}`, { headers }),
      ctx(`jobs/${aliceJob.id}`),
    );
    assert.equal(hidden.status, 404);
    const mutation = await PATCH(
      new NextRequest(origin + `/api/jobs/${aliceJob.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ saved: true }),
      }),
      ctx(`jobs/${aliceJob.id}`),
    );
    assert.ok(mutation.status >= 400);
    const exported = await GET(
      new NextRequest(origin + "/api/export", { headers }),
      ctx("export"),
    );
    assert.equal(exported.status, 200);
    assert.equal((await exported.json()).jobs.length, 0);
    const cleared = await DELETE(
      new NextRequest(origin + "/api/profile", {
        method: "DELETE",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE PROFILE" }),
      }),
      ctx("profile"),
    );
    assert.equal(cleared.status, 200);
    assert.equal(await inWorkspace(accounts[0], () => db.job.count()), 1);
    const login = await auth.handler(
      new Request(origin + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alice@example.test",
          password: "fixture-only-strong-password-123",
        }),
      }),
    );
    assert.equal(login.status, 200);
    const signout = await auth.handler(
      new Request(origin + "/api/auth/sign-out", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    assert.equal(signout.status, 200);
    const revoked = await GET(
      new NextRequest(origin + "/api/jobs", { headers }),
      ctx("jobs"),
    );
    assert.equal(revoked.status, 401);
  } finally {
    for (const key of [
      "APP_ACCESS",
      "PUBLIC_SIGNUP",
      "APP_URL",
      "BETTER_AUTH_SECRET",
    ]) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
});
test("deferred AI is refused server-side and anonymous users cannot import jobs", async () => {
  const testFlag = process.env.JOBCOMPASS_TEST;
  process.env.JOBCOMPASS_TEST = "false";
  try {
    const request = new NextRequest(
      "http://localhost:3000/api/workspace/generations",
      { headers: { host: "localhost:3000" } },
    );
    assert.equal((await workspaceGet(request, ctx("generations"))).status, 410);
    const post = new NextRequest(
      "http://localhost:3000/api/workspace/generations",
      {
        method: "POST",
        headers: { host: "localhost:3000", origin: "http://localhost:3000" },
        body: "{}",
      },
    );
    assert.equal((await workspacePost(post, ctx("generations"))).status, 410);
    assert.equal(await db.aiGeneration.count(), 0);
  } finally {
    process.env.JOBCOMPASS_TEST = testFlag;
  }
  const denied = await directPost(
    new NextRequest("http://public.example/api/direct-discovery", {
      method: "POST",
      headers: { host: "public.example", origin: "http://public.example" },
      body: "{}",
    }),
  );
  assert.equal(denied.status, 403);
});
