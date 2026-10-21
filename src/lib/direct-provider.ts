import { z } from "zod";
import {
  AppError,
  plainText,
  safeUrl,
  type JobProvider,
  type NormalizedJob,
  type ProviderSearchInput,
} from "./contracts";

export const boardInput = z
  .object({
    platform: z.enum(["greenhouse", "lever"]),
    board: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
    region: z.enum(["global", "eu"]).default("global"),
    query: z.string().trim().max(120).default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.platform === "greenhouse" && value.region === "eu")
      ctx.addIssue({
        code: "custom",
        message: "Greenhouse uses its global public API for EU boards too.",
      });
  });
export type BoardInput = z.infer<typeof boardInput>;
const optionalText = z.string().nullish();
const greenhouseJob = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  absolute_url: z.string(),
  content: optionalText,
  location: z.object({ name: optionalText }).nullish(),
});
const leverJob = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  hostedUrl: z.string(),
  applyUrl: optionalText,
  descriptionPlain: optionalText,
  description: optionalText,
  additionalPlain: optionalText,
  lists: z
    .array(z.object({ text: optionalText, content: optionalText }))
    .nullish(),
  categories: z
    .object({ location: optionalText, commitment: optionalText })
    .nullish(),
  workplaceType: optionalText,
});
function readable(text: string) {
  // Greenhouse entity-encodes HTML. Decode before stripping markup, twice at most.
  for (let n = 0; n < 2; n++)
    text = text
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  return plainText(text).slice(0, 100000);
}
function link(value: unknown) {
  const url = safeUrl(value);
  if (!url || !url.startsWith("https://"))
    throw new AppError("malformed_response", 502);
  return url;
}
export function parseBoardResponse(
  data: unknown,
  board: BoardInput,
): NormalizedJob[] {
  const base = {
    employer: board.board,
    country: null,
    remote: null,
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    salaryText: null,
    publishedAt: null,
    qualifications: [],
  };
  try {
    if (board.platform === "greenhouse") {
      return z
        .object({ jobs: z.array(greenhouseJob).max(10000) })
        .parse(data)
        .jobs.map((j) => {
          const url = link(j.absolute_url);
          return {
            ...base,
            providerId: `direct:greenhouse:${board.board}:${j.id}`,
            title: readable(j.title),
            location: j.location?.name || null,
            description: j.content ? readable(j.content) : null,
            publisher: "Greenhouse public board",
            sourceUrl: url,
            applyLinks: [{ url, publisher: "Greenhouse", direct: true }],
          };
        });
    }
    return z
      .array(leverJob)
      .max(10000)
      .parse(data)
      .map((j) => {
        const url = link(j.hostedUrl),
          apply = link(j.applyUrl || j.hostedUrl);
        return {
          ...base,
          providerId: `direct:lever:${board.region}:${board.board}:${j.id}`,
          title: readable(j.text),
          location: j.categories?.location || null,
          employmentType: j.categories?.commitment || null,
          remote: j.workplaceType === "remote" ? true : null,
          description:
            readable(
              [
                j.descriptionPlain || j.description || "",
                ...(j.lists || []).map(
                  (l) => `${l.text || ""}\n${l.content || ""}`,
                ),
                j.additionalPlain || "",
              ].join("\n\n"),
            ) || null,
          publisher: "Lever public board",
          sourceUrl: url,
          applyLinks: [{ url: apply, publisher: "Lever", direct: true }],
        };
      });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("malformed_response", 502);
  }
}

export class DirectBoardProvider implements JobProvider {
  readonly board: BoardInput;
  constructor(
    board: BoardInput,
    private readonly request: typeof fetch = fetch,
  ) {
    this.board = boardInput.parse(board);
  }
  get identity() {
    return `${this.board.platform}:${this.board.region}:${this.board.board}:${encodeURIComponent(this.board.query.trim().toLowerCase())}`;
  }
  async search(input: ProviderSearchInput) {
    if (input.cursor || input.remoteOnly || input.datePosted !== "all")
      throw new AppError("unsupported_direct_filter");
    const url =
      this.board.platform === "greenhouse"
        ? `https://boards-api.greenhouse.io/v1/boards/${this.board.board}/jobs?content=true`
        : `https://api${this.board.region === "eu" ? ".eu" : ""}.lever.co/v0/postings/${this.board.board}?mode=json`;
    try {
      const response = await this.request(url, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(18000),
        headers: { Accept: "application/json" },
      });
      if (!response.ok)
        throw new AppError(
          response.status === 404
            ? "board_not_found"
            : response.status === 429
              ? "direct_rate_limit"
              : "direct_provider_error",
          response.status === 429 ? 429 : 502,
          response.status,
        );
      const reader = response.body?.getReader();
      if (!reader) throw new AppError("malformed_response", 502);
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8000000) {
          await reader.cancel();
          throw new AppError("board_too_large", 502);
        }
        chunks.push(value);
      }
      const terms = this.board.query.toLowerCase().split(/\s+/).filter(Boolean);
      const jobs = parseBoardResponse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
        this.board,
      ).filter((j) =>
        terms.every((term) =>
          `${j.title}\n${j.location || ""}\n${j.description || ""}`
            .toLowerCase()
            .includes(term),
        ),
      );
      if (jobs.length > 500) throw new AppError("narrow_direct_search", 400);
      return { jobs, nextCursor: null, fetchedAt: new Date().toISOString() };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name)
          ? "timeout"
          : "direct_provider_error",
        502,
      );
    }
  }
}
