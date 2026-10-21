import { z } from "zod";
import {
  AppError,
  safeUrl,
  plainText,
  type JobProvider,
  type ProviderSearchInput,
  type ProviderSearchResult,
} from "./contracts";
const text = z.string().nullish();
const wireJob = z.object({
  job_id: z.string().min(1),
  job_title: z.string().min(1),
  employer_name: z.string().min(1),
  job_publisher: text,
  job_apply_link: text,
  job_apply_is_direct: z.boolean().nullish(),
  apply_options: z
    .array(
      z.object({
        apply_link: z.string(),
        publisher: z.string(),
        is_direct: z.boolean().optional(),
      }),
    )
    .nullish(),
  job_description: text,
  job_location: text,
  job_city: text,
  job_state: text,
  job_country: text,
  job_is_remote: z.boolean().nullish(),
  job_employment_type: text,
  job_min_salary: z.number().nullish(),
  job_max_salary: z.number().nullish(),
  job_salary_currency: text,
  job_salary_period: text,
  job_salary: text,
  job_salary_string: text,
  job_posted_at_datetime_utc: text,
  job_google_link: text,
  job_highlights: z.record(z.string(), z.array(z.string())).nullish(),
});
const envelope = z.object({
  status: z.literal("OK"),
  data: z.object({ jobs: z.array(z.unknown()).max(200), cursor: text }),
});
export function parseResponse(body: unknown): ProviderSearchResult {
  const parsed = envelope.safeParse(body);
  if (!parsed.success) throw new AppError("malformed_response", 502);
  const jobs = parsed.data.data.jobs.map((row) => {
    const p = wireJob.safeParse(row);
    if (!p.success) throw new AppError("malformed_response", 502);
    const j = p.data;
    const links = [
      {
        url: j.job_apply_link,
        publisher: j.job_publisher || "Original source",
        direct: j.job_apply_is_direct === true,
      },
      ...(j.apply_options || []).map((o) => ({
        url: o.apply_link,
        publisher: o.publisher,
        direct: o.is_direct === true,
      })),
    ]
      .flatMap((l) => {
        const url = safeUrl(l.url);
        return url ? [{ ...l, url }] : [];
      })
      .filter((l, i, a) => a.findIndex((v) => v.url === l.url) === i)
      .sort((a, b) => Number(b.direct) - Number(a.direct));
    const date = j.job_posted_at_datetime_utc
      ? new Date(j.job_posted_at_datetime_utc)
      : null;
    return {
      providerId: j.job_id,
      title: plainText(j.job_title),
      employer: plainText(j.employer_name),
      location:
        j.job_location ||
        [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", ") ||
        null,
      country: j.job_country?.toLowerCase() || null,
      description: j.job_description ? plainText(j.job_description) : null,
      remote: j.job_is_remote ?? null,
      employmentType: j.job_employment_type ?? null,
      salaryMin: j.job_min_salary ?? null,
      salaryMax: j.job_max_salary ?? null,
      salaryCurrency: j.job_salary_currency ?? null,
      salaryPeriod: j.job_salary_period ?? null,
      salaryText: j.job_salary || j.job_salary_string || null,
      publishedAt: date && !isNaN(date.valueOf()) ? date : null,
      qualifications: (j.job_highlights?.Qualifications || []).map(plainText),
      publisher: j.job_publisher ?? null,
      sourceUrl: safeUrl(j.job_google_link),
      applyLinks: links,
    };
  });
  return {
    jobs,
    nextCursor: parsed.data.data.cursor || null,
    fetchedAt: new Date().toISOString(),
  };
}
export class JSearchProvider implements JobProvider {
  async search(input: ProviderSearchInput): Promise<ProviderSearchResult> {
    const key = process.env.JSEARCH_API_KEY;
    if (!key) throw new AppError("disconnected", 503);
    const url = new URL("https://api.openwebninja.com/jsearch/search-v2");
    url.searchParams.set("query", input.query);
    url.searchParams.set("country", input.country);
    url.searchParams.set("num_pages", "1");
    url.searchParams.set("date_posted", input.datePosted);
    if (input.language) url.searchParams.set("language", input.language);
    if (input.cursor) url.searchParams.set("cursor", input.cursor);
    if (input.remoteOnly) url.searchParams.set("work_from_home", "true");
    try {
      const response = await fetch(url, {
        headers: { "x-api-key": key },
        signal: AbortSignal.timeout(18000),
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok)
        throw new AppError(
          [401, 403].includes(response.status)
            ? "connection_error"
            : response.status === 429
              ? "provider_quota"
              : "provider_error",
          502,
          response.status,
        );
      const raw = await response.text();
      if (raw.length > 5000000) throw new AppError("malformed_response", 502);
      return parseResponse(JSON.parse(raw));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name)
          ? "timeout"
          : "provider_error",
        502,
      );
    }
  }
}
