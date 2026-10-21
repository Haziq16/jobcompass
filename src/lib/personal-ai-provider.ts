import { generateText, Output } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { AppError } from "./contracts";
import { REVIEW_PROVIDER_TIMEOUT_MS } from "./personal-ai-timing";
import {
  credentials,
  evidenceBlocks,
  reviewOutput,
  reviewSystem,
} from "./resume-review-contracts";

export type PersonalCredentials = z.infer<typeof credentials>;
const hosts = {
  openai: "api.openai.com",
  google: "generativelanguage.googleapis.com",
  anthropic: "api.anthropic.com",
  openrouter: "openrouter.ai",
} as const;
export function providerFetch(
  provider: PersonalCredentials["provider"],
  request: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      url.protocol !== "https:" ||
      url.hostname !== hosts[provider] ||
      url.port ||
      url.username ||
      url.password
    )
      throw new AppError("invalid_provider_host", 400);
    const response = await request(input, { ...init, redirect: "error" });
    // No redirects, remote images, tools or arbitrary user-configured endpoints.
    const reader = response.body?.getReader();
    if (!reader) return response;
    let size = 0;
    const parts: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8_000_000) {
        await reader.cancel();
        throw new AppError("provider_response_too_large", 502);
      }
      parts.push(value);
    }
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    return new Response(Buffer.concat(parts), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
export function personalModel(
  raw: PersonalCredentials,
  request: typeof fetch = fetch,
) {
  const config = credentials.parse(raw);
  const options = {
    apiKey: config.apiKey,
    fetch: providerFetch(config.provider, request),
  };
  // Supplying an explicit key to every adapter prevents fallback to owner env keys
  // or Vercel's implicit gateway authentication.
  switch (config.provider) {
    case "openai":
      return createOpenAI({
        ...options,
        baseURL: "https://api.openai.com/v1",
      }).responses(config.model);
    case "google":
      return createGoogleGenerativeAI({
        ...options,
        baseURL: "https://generativelanguage.googleapis.com/v1beta",
      })(config.model);
    case "anthropic":
      return createAnthropic({
        ...options,
        baseURL: "https://api.anthropic.com/v1",
      })(config.model);
    case "openrouter":
      return createOpenAI({
        ...options,
        baseURL: "https://openrouter.ai/api/v1",
        name: "openrouter",
      }).chat(config.model);
  }
}
export type ReviewProvider = (
  config: PersonalCredentials,
  resume: string,
  jobText: string,
) => Promise<{ output: unknown; inputTokens?: number; outputTokens?: number }>;
export const runPersonalReview: ReviewProvider = async (
  config,
  resume,
  jobText,
) => {
  const result = await generateText({
    model: personalModel(config),
    system: reviewSystem,
    prompt: JSON.stringify({
      resumeBlocks: evidenceBlocks(resume),
      jobText: jobText.replace(/\s+/g, " ").trim(),
    }),
    output: Output.object({ schema: reviewOutput }),
    maxOutputTokens: 5500,
    maxRetries: 0,
    ...(config.provider === "openai"
      ? { providerOptions: { openai: { store: false } } }
      : {}),
    abortSignal: AbortSignal.timeout(REVIEW_PROVIDER_TIMEOUT_MS),
  });
  return {
    output: result.output,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  };
};
export function personalProviderError(error: unknown) {
  if (error instanceof AppError) return error.code;
  const e = error as {
    statusCode?: number;
    name?: string;
    cause?: { name?: string; statusCode?: number };
  };
  const status = e?.statusCode || e?.cause?.statusCode;
  if (status === 401 || status === 403) return "provider_auth_failed";
  if (status === 402) return "provider_credit_required";
  if (status === 429) return "provider_rate_limit";
  if (status === 404) return "provider_model_unavailable";
  if (
    [e?.name, e?.cause?.name].some((name) =>
      ["TimeoutError", "AbortError"].includes(name || ""),
    )
  )
    return "provider_timeout";
  return "provider_failed_or_invalid_output";
}
export async function personalModels(
  config: Pick<PersonalCredentials, "provider" | "apiKey">,
  request: typeof fetch = fetch,
) {
  const headers: Record<string, string> = { Accept: "application/json" };
  let url: string;
  switch (config.provider) {
    case "google":
      url =
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";
      headers["x-goog-api-key"] = config.apiKey;
      break;
    case "anthropic":
      url = "https://api.anthropic.com/v1/models?limit=100";
      headers["x-api-key"] = config.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      break;
    case "openai":
      url = "https://api.openai.com/v1/models";
      headers.Authorization = `Bearer ${config.apiKey}`;
      break;
    case "openrouter":
      url = "https://openrouter.ai/api/v1/models";
      headers.Authorization = `Bearer ${config.apiKey}`;
      break;
  }
  const response = await providerFetch(config.provider, request)(url, {
    headers,
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new AppError(
      personalProviderError({ statusCode: response.status }),
      response.status === 429 ? 429 : 400,
    );
  const body = await response.json();
  const list = z
    .object({
      data: z
        .array(
          z.object({
            id: z.string(),
            name: z.string().optional(),
            display_name: z.string().optional(),
          }),
        )
        .optional(),
      models: z
        .array(
          z.object({
            name: z.string(),
            displayName: z.string().optional(),
            supportedGenerationMethods: z.array(z.string()).optional(),
          }),
        )
        .optional(),
      nextPageToken: z.string().optional(),
      has_more: z.boolean().optional(),
    })
    .parse(body);
  const models =
    config.provider === "google"
      ? (list.models || [])
          .filter((m) =>
            m.supportedGenerationMethods?.includes("generateContent"),
          )
          .map((m) => ({
            id: m.name.replace(/^models\//, ""),
            name: m.displayName || m.name,
          }))
      : (list.data || [])
          .filter(
            (m) =>
              !/embed|whisper|tts|realtime|dall-e|image|moderation/i.test(m.id),
          )
          .map((m) => ({ id: m.id, name: m.name || m.display_name || m.id }));
  return {
    models: models.slice(0, 1000).sort((a, b) => a.name.localeCompare(b.name)),
    partial: Boolean(
      list.nextPageToken || list.has_more || models.length > 1000,
    ),
  };
}
