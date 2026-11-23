// Local browser-check readiness probe; returns 404 on hosted deployments.
import { AppError } from "@/lib/contracts";
import { apiError } from "@/lib/http";
export async function GET(req: Request) {
  try {
    if (
      !process.env.JOBCOMPASS_BROWSER_CHECK_ID ||
      process.env.VERCEL ||
      !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.get("host") || "")
    )
      throw new AppError("not_found", 404);
    return Response.json({ checkId: process.env.JOBCOMPASS_BROWSER_CHECK_ID });
  } catch (e) {
    return apiError(e);
  }
}
