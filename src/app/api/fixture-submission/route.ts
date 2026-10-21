import { z } from "zod";
import { authorize } from "@/lib/authorization";
import { AppError } from "@/lib/contracts";
import { fixtureReceipt } from "@/lib/companion";
import { apiError, readJson } from "@/lib/http";
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
export async function POST(req: Request) {
  try {
    if (process.env.APP_ACCESS !== "local")
      throw new AppError("not_found", 404);
    await authorize(req.headers, "POST");
    const data = z
      .object({
        attempt: z.string().min(1),
        token: z.string().min(1),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.email(),
      })
      .strict()
      .parse(await readJson(req));
    return Response.json({
      receipt: await fixtureReceipt(data.attempt, data.token),
    });
  } catch (e) {
    return apiError(e);
  }
}
