import { accountRequest } from "@/lib/account-request";
import { authorize } from "@/lib/authorization";
import { canUseMatches } from "@/lib/match-access";
import { jobWorkspace } from "@/lib/job-workspace";
import { z } from "zod";
import { db } from "@/lib/db";
import { workspaceId } from "@/lib/workspace-context";
import { AppError } from "@/lib/contracts";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return accountRequest(req, async () => {
    const session = await authorize(req.headers, "GET");
    const params = new URL(req.url).searchParams;
    if (params.has("decision")) {
      if (!canUseMatches(session?.user))
        throw new AppError("matching_unavailable", 403);
      const catalogId = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(params.get("decision"));
      return Response.json({
        decision: await db.matchDecision.findUnique({
          where: {
            workspaceId_catalogId: { workspaceId: workspaceId(), catalogId },
          },
          select: { state: true, revision: true },
        }),
      });
    }
    return Response.json(
      await jobWorkspace(
        new URL(req.url).searchParams,
        canUseMatches(session?.user),
      ),
    );
  });
}
