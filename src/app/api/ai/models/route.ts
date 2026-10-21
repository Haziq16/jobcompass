import { aiRequest } from "@/lib/ai-access";
import { credentials } from "@/lib/resume-review-contracts";
import {
  personalModels,
  personalProviderError,
} from "@/lib/personal-ai-provider";
import { apiError, readJson } from "@/lib/http";
import { AppError } from "@/lib/contracts";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function POST(req: Request) {
  return aiRequest(req, async () => {
    try {
      const config = credentials
        .pick({ provider: true, apiKey: true })
        .strict()
        .parse(await readJson(req));
      try {
        return Response.json(await personalModels(config));
      } catch (error) {
        if (error instanceof AppError) throw error;
        const code = personalProviderError(error);
        throw new AppError(
          code === "provider_failed_or_invalid_output"
            ? "model_list_unavailable"
            : code,
          400,
        );
      }
    } catch (error) {
      return apiError(error);
    }
  });
}
