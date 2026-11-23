import { z } from "./zod";
export const searchInput = z
  .object({
    query: z.string().trim().min(3).max(250),
    country: z
      .string()
      .regex(/^[a-zA-Z]{2}$/)
      .transform((s) => s.toLowerCase()),
    language: z
      .string()
      .regex(/^[a-z]{2}$/)
      .optional(),
    cursor: z.string().min(1).max(12000).optional(),
    remoteOnly: z.boolean().default(false),
    datePosted: z
      .enum(["all", "today", "3days", "week", "month"])
      .default("all"),
  })
  .strict();
export type ProviderSearchInput = z.infer<typeof searchInput>;
export type ApplyLink = { url: string; publisher: string; direct: boolean };
export type NormalizedJob = {
  providerId: string;
  title: string;
  employer: string;
  location: string | null;
  country: string | null;
  description: string | null;
  remote: boolean | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  salaryText: string | null;
  publishedAt: Date | null;
  qualifications: string[];
  publisher: string | null;
  sourceUrl: string | null;
  applyLinks: ApplyLink[];
};
export type ProviderSearchResult = {
  jobs: NormalizedJob[];
  nextCursor: string | null;
  fetchedAt: string;
};
export interface JobProvider {
  search(input: ProviderSearchInput): Promise<ProviderSearchResult>;
}
export const statuses = [
  "Saved",
  "Preparing",
  "Applied",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
] as const;
export function safeUrl(value: unknown): string | null {
  try {
    const u = new URL(String(value));
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}
export function normalizedUrl(value: string): string {
  const u = new URL(value);
  for (const key of [...u.searchParams.keys()])
    if (/^utm_/i.test(key) || ["gclid", "fbclid"].includes(key))
      u.searchParams.delete(key);
  u.searchParams.sort();
  return u.toString();
}
export function plainText(value: string): string {
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public upstreamStatus?: number,
  ) {
    super(code);
  }
}
