import { z } from "zod";
import { aiRequest } from "@/lib/ai-access";
import { apiError, readJson } from "@/lib/http";
import {
  studioApplication,
  updateStudioApplication,
} from "@/lib/studio-application";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const target = z
  .object({
    source: z.enum(["catalog", "workspace"]),
    jobId: z.string().min(1).max(150),
  })
  .strict();
export function GET(req: Request) {
  return aiRequest(req, async () => {
    try {
      const p = new URL(req.url).searchParams;
      const data = target.parse({
        source: p.get("source"),
        jobId: p.get("jobId"),
      });
      return Response.json(await studioApplication(data.source, data.jobId));
    } catch (e) {
      return apiError(e);
    }
  });
}
export function POST(req: Request) {
  return aiRequest(req, async () => {
    try {
      const data = target
        .extend({ action: z.enum(["prepare", "confirm_submission"]) })
        .parse(await readJson(req));
      return Response.json(
        await updateStudioApplication(data.source, data.jobId, data.action),
      );
    } catch (e) {
      return apiError(e);
    }
  });
}
