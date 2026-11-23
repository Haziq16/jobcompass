import { z } from "@/lib/zod";
import { accountRequest } from "@/lib/account-request";
import { authorize } from "@/lib/authorization";
import { canUseMatches } from "@/lib/match-access";
import { AppError } from "@/lib/contracts";
import { readJson, boundedBytes } from "@/lib/http";
import {
  getCandidate,
  getApplicationAnswer,
  saveCandidate,
  importCandidateCv,
  applicationMemory,
  saveApplicationAnswer,
  lookupApplicationAnswer,
  deleteApplicationAnswer,
  dismissApplicationQuestion,
} from "@/lib/application-memory";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path?: string[] }> };
function handler(req: Request, ctx: Context) {
  return accountRequest(req, async () => {
    const session = await authorize(req.headers, req.method);
    if (!canUseMatches(session?.user))
      throw new AppError("application_profile_unavailable", 403);
    const path = (await ctx.params).path?.join("/") || "profile";
    if (req.method === "GET") {
      if (path.startsWith("answers/"))
        return Response.json(await getApplicationAnswer(path.slice(8)));
      if (path === "profile") return Response.json(await getCandidate());
      if (path === "memory") {
        const page = z.coerce
          .number()
          .int()
          .min(1)
          .max(1000)
          .parse(new URL(req.url).searchParams.get("page") || 1);
        const job=new URL(req.url).searchParams.get("job");
        const catalogId=job?z.string().regex(/^[a-f0-9]{64}$/).parse(job):undefined;
        return Response.json(await applicationMemory(page,catalogId));
      }
    }
    if (req.method === "POST") {
      if (path === "import") {
        const bytes = await boundedBytes(req, 5 * 1024 * 1024 + 16000);
        const form = await new Response(bytes, {
          headers: { "Content-Type": req.headers.get("content-type") || "" },
        }).formData();
        const file = form.get("file");
        if (!(file instanceof File)) throw new AppError("cv_required", 400);
        return Response.json(
          await importCandidateCv({
            bytes: Buffer.from(await file.arrayBuffer()),
            name: file.name,
          }),
        );
      }
      const input = await readJson(req);
      if (path === "profile") return Response.json(await saveCandidate(input));
      if (path === "import-existing") {
        const data = z
          .object({ assetId: z.string().max(100).optional() })
          .strict()
          .parse(input);
        return Response.json(await importCandidateCv(undefined, data.assetId));
      }
      if (path === "lookup")
        return Response.json(await lookupApplicationAnswer(input));
      if (path === "answers")
        return Response.json(await saveApplicationAnswer(input));
      if (path === "dismiss") {
        const data = z
          .object({
            id: z.string().max(100),
            revision: z.number().int().min(1),
          })
          .strict()
          .parse(input);
        return Response.json(
          await dismissApplicationQuestion(data.id, data.revision),
        );
      }
    }
    if (req.method === "DELETE" && path === "answers") {
      const data = z
        .object({ id: z.string().max(100), revision: z.number().int().min(1) })
        .strict()
        .parse(await readJson(req));
      return Response.json(
        await deleteApplicationAnswer(data.id, data.revision),
      );
    }
    throw new AppError("not_found", 404);
  });
}
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
