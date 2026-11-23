import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { authorize } from "@/lib/authorization";
import { AppError } from "@/lib/contracts";
import { prepare } from "@/lib/assistant";
import { apiError } from "@/lib/http";
import { accountRequest } from "@/lib/account-request";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    await authorize(req.headers, req.method);
    const [section, id] = (await ctx.params).path;
    const method = req.method;
    if (section === "facets" && method === "GET") {
      const fields = [
        "employmentType",
        "seniority",
        "workArrangement",
        "industry",
        "employer",
        "salaryCurrency",
        "salaryPeriod",
      ] as const;
      const entries = await Promise.all(
        fields.map(async (field) => [
          field,
          (
            await db.job.findMany({
              distinct: [field],
              select: { [field]: true },
              where: { hidden: false },
              take: 300,
            })
          )
            .map((row) => row[field])
            .filter(Boolean),
        ]),
      );
      return Response.json(Object.fromEntries(entries));
    }
    if (section === "prepare" && id && method === "POST")
      return Response.json(await prepare(id));
    if (section === "applications" && id && method === "GET")
      return Response.json(
        await db.application.findUniqueOrThrow({
          where: { id },
          include: {
            job: { include: { sources: true } },
            events: { orderBy: { createdAt: "desc" } },
            attempts: {
              select: {
                id: true,
                state: true,
                targetUrl: true,
                evidence: true,
                createdAt: true,
                expiresAt: true,
              },
              orderBy: { createdAt: "desc" },
            },
          },
        }),
      );
    throw new AppError("not_found", 404);
  } catch (e) {
    return apiError(e);
  }
}
function scopedHandler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return accountRequest(req, () => handler(req, context));
}
export { scopedHandler as GET, scopedHandler as POST };
