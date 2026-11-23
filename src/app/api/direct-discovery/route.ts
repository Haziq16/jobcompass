import { NextRequest } from "next/server";
import { z } from "@/lib/zod";
import { authorize } from "@/lib/authorization";
import { boardInput, DirectBoardProvider } from "@/lib/direct-provider";
import { discover } from "@/lib/discovery";
import { db } from "@/lib/db";
import { apiError, readJson } from "@/lib/http";
import { accountRequest } from "@/lib/account-request";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handler(req: NextRequest) {
  try {
    await authorize(req.headers, "POST");
    const data = z
      .object({
        input: boardInput,
        key: z.string().uuid(),
        refresh: z.boolean().default(false),
      })
      .strict()
      .parse(await readJson(req));
    const result = await discover(
      {
        query: data.input.query || "All board jobs",
        country: "zz",
        datePosted: "all",
        remoteOnly: false,
      },
      data.key,
      data.refresh,
      new DirectBoardProvider(data.input),
    );
    const count =
      "run" in result && result.run
        ? await db.searchRunJob.count({ where: { runId: result.run.id } })
        : null;
    return Response.json(
      { ...result, count },
      { status: "pending" in result ? 202 : 200 },
    );
  } catch (error) {
    return apiError(error);
  }
}
export function POST(req: NextRequest) {
  return accountRequest(req, () => handler(req));
}
