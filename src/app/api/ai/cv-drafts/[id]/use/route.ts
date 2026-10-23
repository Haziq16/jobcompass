import { z } from "zod";
import { aiRequest } from "@/lib/ai-access";
import { readJson } from "@/lib/http";
import { savePreparedCv } from "@/lib/prepared-cv";
export function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  return aiRequest(req, async () => {
    const { revision } = z
      .object({ revision: z.number().int().min(1) })
      .strict()
      .parse(await readJson(req));
    return Response.json(
      await savePreparedCv((await context.params).id, revision),
    );
  });
}
