import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { authDb } from "../src/lib/db";
import { inWorkspace } from "../src/lib/workspace-context";
import { parseCatalog } from "../src/lib/catalog-provider";
import { publishCatalogBoard, saveCatalogJob } from "../src/lib/catalog";
import { matchPreferencesSchema } from "../src/lib/match-contracts";
import {
  matchSettings,
  saveMatchSettings,
  matchDeck,
  decideMatch,
  undoMatch,
  matchCollection,
  prioritizeMatch,
  resetMatchLearning,
  salaryEvidence,
} from "../src/lib/matches";
import { GET, POST } from "../src/app/api/matches/[[...path]]/route";
import { canUseMatches } from "../src/lib/match-access";
import { NextRequest } from "next/server";
import {
  GET as workspaceGet,
  DELETE as workspaceDelete,
} from "../src/app/api/[...path]/route";
if (
  process.env.JOBCOMPASS_TEST !== "true" ||
  !process.env.DATABASE_URL?.includes("/jobcompass_test")
)
  throw new Error("Test database only");
const board = {
  id: "greenhouse:swipe-fixture",
  platform: "greenhouse" as const,
  token: "swipe-fixture",
  name: "Matching Fixture",
};
const run = <T>(action: () => Promise<T>, who = "alice") =>
  inWorkspace(who, action);
const settings = (extra = {}) =>
  matchPreferencesSchema.parse({
    titles: ["Engineer"],
    skills: ["Kotlin"],
    locations: [],
    reviewed: true,
    ...extra,
  });
async function seed(
  rows: { id: number; title?: string; content?: string; location?: string }[],
) {
  const jobs = parseCatalog(
    {
      jobs: rows.map((r) => ({
        id: r.id,
        title: r.title || "Kotlin Engineer",
        content: r.content || "Kotlin and PostgreSQL are required.",
        absolute_url: "https://example.test/apply/" + r.id,
        location: { name: r.location || "Singapore" },
      })),
    },
    board,
  );
  await publishCatalogBoard(board.id, jobs);
  return jobs;
}
const decision = (
  id: string,
  state = "queued",
  revision = 0,
  reason: string | null = null,
) => ({
  requestId: randomUUID(),
  catalogId: id,
  state,
  expectedRevision: revision,
  reason,
});
beforeEach(async () => {
  process.env.APP_ACCESS = "local";
  await authDb.$executeRawUnsafe(
    'TRUNCATE "MatchPreferences","MatchDecision","MatchAction","CatalogBoard","Job","Profile" CASCADE',
  );
  await authDb.catalogBoard.create({ data: board });
});
test("matching preview defaults to owner-only and can be disabled or explicitly released", () => {
  const env = { APP_ACCESS: "hosted", OWNER_EMAIL: "owner@example.test" };
  assert.equal(canUseMatches({ email: "OWNER@example.test" }, env), true);
  assert.equal(canUseMatches({ email: "other@example.test" }, env), false);
  assert.equal(canUseMatches(undefined, env), false);
  assert.equal(
    canUseMatches(
      { email: "other@example.test" },
      { ...env, MATCH_MODE: "all" },
    ),
    true,
  );
  assert.equal(
    canUseMatches(
      { email: "owner@example.test" },
      { ...env, MATCH_MODE: "off" },
    ),
    false,
  );
});
after(() => authDb.$disconnect());
test("onboarding is required, scoped, validated and protected against stale updates", async () => {
  await assert.rejects(
    run(() => matchDeck(new URLSearchParams())),
    /match_setup_required/,
  );
  await run(() => saveMatchSettings(settings(), 0));
  assert.equal((await run(matchSettings)).revision, 1);
  assert.equal((await run(matchSettings, "bob")).preferences, null);
  await assert.rejects(
    run(() => saveMatchSettings(settings(), 0)),
    /revision_conflict/,
  );
  await assert.rejects(
    run(() => saveMatchSettings({ titles: [], skills: [], reviewed: true }, 1)),
  );
});
test("deck requires role or skill evidence; matching location alone never fills it", async () => {
  await seed([
    { id: 1 },
    { id: 2, title: "Florist", content: "Arrange flowers" },
  ]);
  await run(() => saveMatchSettings(settings({ locations: ["Singapore"] }), 0));
  const deck = await run(() => matchDeck(new URLSearchParams()));
  assert.equal(deck.jobs.length, 1);
  assert.ok(
    deck.jobs[0].recommendation.reasons.some((r) => r.includes("Kotlin")),
  );
  assert.ok(deck.jobs[0].warnings.some((w) => w.includes("not verified")));
});
test("strict location, arrangement, employer and explicit no-sponsorship filters apply before pagination", async () => {
  const jobs = await seed([
    { id: 1, location: "Singapore" },
    { id: 2, location: "London, UK" },
    { id: 3, location: "Singapore", content: "Kotlin. No visa sponsorship." },
  ]);
  await authDb.catalogJob.update({
    where: { id: jobs[0].id },
    data: { remote: true },
  });
  await run(() =>
    saveMatchSettings(
      settings({
        locations: ["Singapore"],
        locationStrict: true,
        arrangement: "remote",
        arrangementStrict: true,
        allowUnknown: false,
        needsSponsorship: true,
        excludeNoSponsorship: true,
      }),
      0,
    ),
  );
  const result = await run(() => matchDeck(new URLSearchParams()));
  assert.deepEqual(
    result.jobs.map((j) => j.id),
    [jobs[0].id],
  );
});
test("salary filtering compares only explicit matching currency and period, with honest unknown handling", async () => {
  const jobs = await seed([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
  for (const [i, pay] of [
    "USD 40,000 - 50,000 per year",
    "USD 90k - 110k annually",
    "$120,000",
    "EUR 100,000 per year",
  ].entries())
    await authDb.catalogJob.update({
      where: { id: jobs[i].id },
      data: { salaryText: pay },
    });
  await run(() =>
    saveMatchSettings(
      settings({ salaryMinimum: 70000, salaryStrict: true }),
      0,
    ),
  );
  assert.equal((await run(() => matchDeck(new URLSearchParams()))).total, 3);
  await run(() =>
    saveMatchSettings(
      settings({
        salaryMinimum: 70000,
        salaryStrict: true,
        allowUnknown: false,
      }),
      1,
    ),
  );
  assert.deepEqual(
    (await run(() => matchDeck(new URLSearchParams()))).jobs.map((j) => j.id),
    [jobs[1].id],
  );
  assert.equal(salaryEvidence("$120,000"), null);
});
test("concurrent replays create one queue decision; cross-account request IDs never disclose or mutate it", async () => {
  const [job] = await seed([{ id: 1 }]);
  const input = decision(job.id);
  await Promise.all([
    run(() => decideMatch(input)),
    run(() => decideMatch(input)),
  ]);
  assert.equal(await authDb.matchDecision.count(), 1);
  assert.equal(await authDb.matchAction.count(), 1);
  assert.equal((await run(() => matchCollection("queued"))).total, 1);
  assert.equal((await run(() => matchCollection("queued"), "bob")).total, 0);
  await assert.rejects(
    run(() => decideMatch(input), "bob"),
    /revision_conflict/,
  );
});
test("undo restores the deck with the current revision and can be replayed safely", async () => {
  const [job] = await seed([{ id: 1 }]);
  await run(() => saveMatchSettings(settings(), 0));
  const result = await run(() => decideMatch(decision(job.id)));
  assert.equal((await run(() => matchDeck(new URLSearchParams()))).total, 0);
  await run(() => undoMatch(result.actionId));
  await run(() => undoMatch(result.actionId));
  const restored = await run(() => matchDeck(new URLSearchParams()));
  assert.equal(restored.jobs[0].decisionRevision, 2);
  await run(() => decideMatch(decision(job.id, "saved", 2)));
  assert.equal((await run(() => matchCollection("saved"))).total, 1);
  assert.equal(await authDb.job.count(), 0);
});
test("stale actions and another account cannot undo or overwrite a newer decision", async () => {
  const [job] = await seed([{ id: 1 }]);
  const result = await run(() => decideMatch(decision(job.id)));
  const row = (await run(() => matchCollection("queued"))).rows[0];
  await assert.rejects(
    run(() => undoMatch(result.actionId), "bob"),
    /not_found/,
  );
  await assert.rejects(
    run(() => prioritizeMatch(row.id, 2, row.revision), "bob"),
    /revision_conflict/,
  );
  await run(() => prioritizeMatch(row.id, 2, row.revision));
  await assert.rejects(
    run(() => undoMatch(result.actionId)),
    /revision_conflict/,
  );
  await assert.rejects(
    run(() => decideMatch(decision(job.id, "passed", 1))),
    /revision_conflict/,
  );
});
test("closed or deleted listings stay readable in the queue and removable without pretending availability", async () => {
  const [job] = await seed([{ id: 1 }]);
  await run(() => decideMatch(decision(job.id)));
  await publishCatalogBoard(board.id, []);
  let row = (await run(() => matchCollection("queued"))).rows[0];
  assert.equal(row.available, false);
  await assert.rejects(
    run(() => decideMatch(decision(job.id, "queued", row.revision))),
    /listing_unavailable/,
  );
  await authDb.catalogJob.delete({ where: { id: job.id } });
  row = (await run(() => matchCollection("queued"))).rows[0];
  await run(() => decideMatch(decision(job.id, "removed", row.revision)));
  assert.equal(
    (await run(() => matchCollection("removed"))).rows[0].snapshot !== null,
    true,
  );
});
test("existing shortlist copies are excluded; saved swipe decisions are private and never duplicate a submission", async () => {
  const [job] = await seed([{ id: 1 }]);
  await run(() => saveMatchSettings(settings(), 0));
  await run(() => saveCatalogJob(job.id));
  assert.equal((await run(() => matchDeck(new URLSearchParams()))).total, 0);
  assert.equal(await authDb.application.count(), 0);
});
test("explicit pass feedback can be reset without erasing decisions or preferences", async () => {
  const [job] = await seed([{ id: 1 }]);
  await run(() => decideMatch(decision(job.id, "passed", 0, "Employer")));
  await run(resetMatchLearning);
  const passed = await run(() => matchCollection("passed"));
  assert.equal(passed.total, 1);
  assert.equal(passed.rows[0].reason, null);
});
test("match APIs reject anonymous hosted requests, cross-origin mutations and invalid payloads", async () => {
  const env = {
    APP_ACCESS: process.env.APP_ACCESS,
    APP_URL: process.env.APP_URL,
    PUBLIC_SIGNUP: process.env.PUBLIC_SIGNUP,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  };
  try {
    process.env.APP_ACCESS = "hosted";
    process.env.APP_URL = "https://matches.example";
    process.env.PUBLIC_SIGNUP = "true";
    process.env.BETTER_AUTH_SECRET =
      "fixture-only-test-secret-with-32-characters";
    assert.equal(
      (
        await GET(
          new Request("https://matches.example/api/matches", {
            headers: { host: "matches.example" },
          }),
          { params: Promise.resolve({}) },
        )
      ).status,
      401,
    );
    process.env.APP_ACCESS = "local";
    assert.equal(
      (
        await POST(
          new Request("http://127.0.0.1:3000/api/matches/decision", {
            method: "POST",
            headers: { host: "127.0.0.1:3000", origin: "https://evil.example" },
            body: "{}",
          }),
          { params: Promise.resolve({ path: ["decision"] }) },
        )
      ).status,
      403,
    );
  } finally {
    Object.assign(process.env, env);
  }
});

test("exports include only owned matching data; clearing a profile removes its matching facts while preserving decisions", async () => {
  const [job] = await seed([{ id: 1 }]);
  await run(() => saveMatchSettings(settings(), 0), "local");
  await run(
    () =>
      saveMatchSettings(
        settings({ workAuthorization: ["Private country"] }),
        0,
      ),
    "bob",
  );
  await run(() => decideMatch(decision(job.id)), "local");
  const exported = await workspaceGet(
    new NextRequest("http://127.0.0.1:3000/api/export", {
      headers: { host: "127.0.0.1:3000" },
    }),
    { params: Promise.resolve({ path: ["export"] }) },
  );
  assert.equal(exported.status, 200);
  const data = await exported.json();
  assert.equal(data.matchingPreferences.length, 1);
  assert.equal(data.matchingDecisions.length, 1);
  assert.ok(!JSON.stringify(data).includes("Private country"));
  const cleared = await workspaceDelete(
    new NextRequest("http://127.0.0.1:3000/api/profile", {
      method: "DELETE",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirm: "DELETE PROFILE" }),
    }),
    { params: Promise.resolve({ path: ["profile"] }) },
  );
  assert.equal(cleared.status, 200);
  assert.equal((await run(matchSettings, "local")).preferences, null);
  assert.equal((await run(() => matchCollection("queued"), "local")).total, 1);
  assert.notEqual((await run(matchSettings, "bob")).preferences, null);
});
