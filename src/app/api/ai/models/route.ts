import { aiRequest } from "@/lib/ai-access";
import {
  modelListInput,
  resolvePersonalCredentials,
} from "@/lib/personal-ai-connection";
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
      const input = modelListInput.parse(await readJson(req));
      const config = await resolvePersonalCredentials({
        ...input,
        model: "metadata-only",
      });
      try {
        return Response.json(await personalModels(config));
      } catch (error) {
        if (error instanceof AppError) throw error;
        const code = personalProviderError(error);
        throw new AppError(
          code === "provider_timeout"
            ? "model_list_timeout"
            : code === "provider_failed_or_invalid_output"
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
