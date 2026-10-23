import { z } from "zod";
import { aiRequest } from "@/lib/ai-access";
import { readJson } from "@/lib/http";
import {
  connectionInput,
  resolvePersonalCredentials,
} from "@/lib/personal-ai-connection";
import {
  applicationMaterials,
  createApplicationMaterials,
  materialsInput,
} from "@/lib/application-materials";
import { db } from "@/lib/db";
import { editDraft } from "@/lib/assistant";
import { AppError } from "@/lib/contracts";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export function GET(req: Request) {
  return aiRequest(req, async () =>
    Response.json({
      runs: await applicationMaterials(
        z
          .string()
          .min(1)
          .max(150)
          .parse(new URL(req.url).searchParams.get("reviewId")),
      ),
    }),
  );
}
export function POST(req: Request) {
  return aiRequest(req, async () => {
    const data = materialsInput
      .extend(connectionInput.shape)
      .parse(await readJson(req));
    return Response.json(
      await createApplicationMaterials(
        {
          reviewId: data.reviewId,
          requestKey: data.requestKey,
          questions: data.questions,
          consent: data.consent,
        },
        await resolvePersonalCredentials(data),
      ),
    );
  });
}
export function PATCH(req: Request) {
  return aiRequest(req, async () => {
    const data = z
      .object({
        id: z.string().min(1).max(150),
        revision: z.number().int().min(1),
        content: z.string().trim().min(20).max(10000),
      })
      .strict()
      .parse(await readJson(req));
    const draft = await db.documentDraft.findUnique({
      where: { id: data.id },
      include: { generation: true },
    });
    if (
      !draft ||
      draft.kind !== "cover_letter" ||
      (draft.generation.settings as { kind?: string }).kind !==
        "application-materials"
    )
      throw new AppError("draft_not_found", 404);
    await editDraft(data.id, data.content, data.revision);
    return Response.json({ saved: true });
  });
}
