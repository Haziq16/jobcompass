import { db } from "./db";
export async function settings() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return db.settings.upsert({
    where: { id: "owner" },
    update: {},
    create: {
      id: "owner",
      cycleStart: start,
      cycleEnd: end,
      allowance: Number(process.env.MONTHLY_ALLOWANCE || 200),
      budget: Number(process.env.MONTHLY_BUDGET || 180),
      dailyCap: Number(process.env.DAILY_CAP || 6),
      cacheHours: Number(process.env.CACHE_HOURS || 12),
      timezone: process.env.QUOTA_TIMEZONE || "Asia/Kuala_Lumpur",
    },
  });
}
export async function profile() {
  return db.profile.upsert({
    where: { id: "owner" },
    update: {},
    create: { id: "owner" },
  });
}
export function dayKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export async function usage() {
  const s = await settings();
  const rows = await db.apiRequestLedger.findMany({
    orderBy: { createdAt: "desc" },
  });
  const consumed = rows.filter((r) => r.state !== "released");
  const monthly = Math.max(
    0,
    consumed
      .filter((r) => r.cycleId === s.cycleStart.toISOString())
      .reduce((v, r) => v + r.units, 0) + s.adjustment,
  );
  const today = dayKey(new Date(), s.timezone);
  const daily = consumed
    .filter((r) => dayKey(r.createdAt, s.timezone) === today)
    .reduce((v, r) => v + r.units, 0);
  return {
    settings: s,
    monthly,
    daily,
    connected: Boolean(process.env.JSEARCH_API_KEY),
    planConfirmed: process.env.JSEARCH_PLAN_CONFIRMED === "true",
    expired: new Date() >= s.cycleEnd,
    ledger: rows.slice(0, 100),
  };
}
