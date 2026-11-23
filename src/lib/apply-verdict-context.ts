import { authDb } from "./db";
import { getCandidate } from "./application-memory";
import type { DeclaredFacts, Freshness } from "./apply-verdict";

// Only confirmed, unexpired profile facts are used. Nothing here is sent to the
// AI provider; the verdict compares these on the server.
export async function declaredFacts(): Promise<DeclaredFacts> {
  const candidate = await getCandidate();
  const confirmed = (section: string) =>
    candidate.sections.some((s) => s.section === section && s.confirmed);
  const today = new Date().toISOString().slice(0, 10);
  return {
    timezone:
      confirmed("preferences") && candidate.values.preferences.timezone
        ? candidate.values.preferences.timezone
        : null,
    eligibility: confirmed("eligibility")
      ? candidate.values.eligibility
          .filter((e) => !e.expiresOn || e.expiresOn >= today)
          .map((e) => ({
            country: e.country,
            status: e.status,
            needsSponsorship: e.needsSponsorship,
          }))
      : [],
  };
}

export async function listingFreshness(
  source: "catalog" | "workspace",
  id: string,
): Promise<Freshness> {
  if (source === "workspace")
    return {
      status: "unknown",
      postedAt: null,
      lastConfirmedAt: null,
      note: "Saved copy in your workspace. JobCompass does not re-check it with the employer.",
    };
  const job = await authDb.catalogJob.findUnique({
    where: { id },
    select: {
      active: true,
      publishedAt: true,
      firstSeen: true,
      board: { select: { lastSuccessAt: true } },
    },
  });
  if (!job)
    return {
      status: "unknown",
      postedAt: null,
      lastConfirmedAt: null,
      note: "This listing is no longer in the catalogue.",
    };
  const confirmedAt = job.board.lastSuccessAt;
  const postedAt = (job.publishedAt || job.firstSeen).toISOString();
  if (!job.active)
    return {
      status: "closed",
      postedAt,
      lastConfirmedAt: confirmedAt?.toISOString() || null,
      note: "The listing was missing from the employer's latest complete feed.",
    };
  if (confirmedAt && confirmedAt.valueOf() > Date.now() - 48 * 3600000)
    return {
      status: "live",
      postedAt,
      lastConfirmedAt: confirmedAt.toISOString(),
      note: "Seen in the employer's feed within the last 48 hours.",
    };
  return {
    status: "unconfirmed",
    postedAt,
    lastConfirmedAt: confirmedAt?.toISOString() || null,
    note: "The employer's feed has not been confirmed in the last 48 hours. Check the employer posting.",
  };
}
