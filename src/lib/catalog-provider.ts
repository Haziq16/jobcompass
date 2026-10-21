import { z } from "zod";
import { createHash } from "node:crypto";
import { AppError, plainText, safeUrl } from "./contracts";
import { parseBoardResponse } from "./direct-provider";
import { boardUrl, type PublicBoard } from "./catalog-boards";

export type PublicJob = {
  id: string;
  providerId: string;
  title: string;
  employer: string;
  location: string | null;
  country: string | null;
  remote: boolean | null;
  employmentType: string | null;
  department: string | null;
  description: string | null;
  salaryText: string | null;
  sourceUrl: string;
  applyUrl: string;
  publishedAt: string | null;
  hash: string;
  searchText: string;
};
const text = z.string().nullish();
const ashby = z.object({
  jobs: z
    .array(
      z.object({
        id: text,
        title: z.string().min(1),
        location: text,
        department: text,
        secondaryLocations: z.array(z.object({ location: text })).nullish(),
        descriptionPlain: text,
        descriptionHtml: text,
        isListed: z.boolean(),
        isRemote: z.boolean().nullish(),
        employmentType: text,
        publishedAt: text,
        jobUrl: z.string(),
        applyUrl: z.string(),
        address: z
          .object({
            postalAddress: z.object({ addressCountry: text }).nullish(),
          })
          .nullish(),
        compensation: z
          .object({
            compensationTierSummary: text,
            scrapeableCompensationSalarySummary: text,
          })
          .nullish(),
      }),
    )
    .max(20000),
});
function httpsLink(value: string) {
  const safe = safeUrl(value);
  if (!safe?.startsWith("https://"))
    throw new AppError("malformed_response", 502);
  return safe;
}
function date(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()))
    throw new AppError("malformed_response", 502);
  return parsed.toISOString();
}
export function parseCatalog(data: unknown, board: PublicBoard): PublicJob[] {
  let rows: Omit<PublicJob, "id" | "hash" | "searchText">[];
  if (board.platform === "ashby") {
    rows = ashby
      .parse(data)
      .jobs.filter((j) => j.isListed)
      .map((j) => {
        const url = httpsLink(j.jobUrl);
        return {
          providerId: `direct:ashby:${board.token}:${j.id || new URL(url).pathname.split("/").filter(Boolean).pop()}`,
          title: plainText(j.title),
          employer: board.name,
          location:
            [j.location, ...(j.secondaryLocations || []).map((l) => l.location)]
              .filter(Boolean)
              .join(" · ") || null,
          country: j.address?.postalAddress?.addressCountry || null,
          remote: j.isRemote ?? null,
          employmentType: j.employmentType || null,
          department: j.department || null,
          description:
            plainText(j.descriptionPlain || j.descriptionHtml || "") || null,
          salaryText:
            j.compensation?.scrapeableCompensationSalarySummary ||
            j.compensation?.compensationTierSummary ||
            null,
          sourceUrl: url,
          applyUrl: httpsLink(j.applyUrl),
          publishedAt: date(j.publishedAt),
        };
      });
  } else {
    rows = parseBoardResponse(data, {
      platform: board.platform,
      board: board.token,
      query: "",
      region: "global",
    }).map((j) => ({
      providerId: j.providerId,
      title: j.title,
      employer: board.name,
      location: j.location,
      country: j.country,
      remote: j.remote,
      employmentType: j.employmentType,
      department: null,
      description: j.description,
      salaryText: j.salaryText,
      sourceUrl: httpsLink(j.sourceUrl!),
      applyUrl: httpsLink(j.applyLinks[0].url),
      publishedAt: j.publishedAt?.toISOString() || null,
    }));
  }
  // Greenhouse updated_at is deliberately not treated as a publication date.
  const unique = new Map<string, PublicJob>();
  for (const row of rows) {
    const fields = {
      ...row,
      title: row.title.slice(0, 500),
      location: row.location?.slice(0, 2000) || null,
      description: row.description?.slice(0, 30000) || null,
    };
    const id = createHash("sha256").update(row.providerId).digest("hex");
    const hash = createHash("sha256")
      .update(JSON.stringify(fields))
      .digest("hex");
    const searchText = [
      fields.title,
      fields.employer,
      fields.location,
      fields.department,
      fields.description?.slice(0, 6000),
    ]
      .filter(Boolean)
      .join("\n");
    unique.set(id, { ...fields, id, hash, searchText });
  }
  return [...unique.values()];
}
export async function fetchCatalogBoard(
  board: PublicBoard & { etag?: string | null; modified?: string | null },
  request: typeof fetch = fetch,
) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (board.etag) headers["If-None-Match"] = board.etag;
  if (board.modified) headers["If-Modified-Since"] = board.modified;
  const response = await request(boardUrl(board), {
    headers,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 304) return { unchanged: true as const };
  if (!response.ok)
    throw new AppError(
      response.status === 429 ? "source_rate_limited" : "source_unavailable",
      502,
    );
  const reader = response.body?.getReader();
  if (!reader) throw new AppError("malformed_response", 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 48_000_000) {
      await reader.cancel();
      throw new AppError("source_too_large", 502);
    }
    chunks.push(value);
  }
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  // Avoid closing jobs on truncated or unsupported snapshots.
  if (board.platform === "greenhouse") {
    const gh = data as { jobs?: unknown[]; meta?: { total?: number } };
    if (typeof gh.meta?.total === "number" && gh.meta.total !== gh.jobs?.length)
      throw new AppError("incomplete_source", 502);
  }
  return {
    unchanged: false as const,
    jobs: parseCatalog(data, board),
    etag: response.headers.get("etag"),
    modified: response.headers.get("last-modified"),
  };
}
