import { z } from "zod";
import { aiRequest } from "@/lib/ai-access";
import { readJson } from "@/lib/http";
import { db } from "@/lib/db";
import { ownedCvSource } from "@/lib/cv-source";
import { inspectAtsDocument } from "@/lib/ats-document";
import { analyzeAts } from "@/lib/ats-analysis";
import {
  renderDraftDocument,
  verifyCvExport,
} from "@/lib/cv-export-verification";
import { AppError } from "@/lib/contracts";
import { keywordEvidenceText } from "@/lib/keyword-evidence";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const input = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("asset"),
      id: z.string().min(1).max(150),
      jobText: z.string().max(40000).default(""),
    })
    .strict(),
  z
    .object({
      source: z.literal("draft"),
      id: z.string().min(1).max(150),
      revision: z.number().int().min(1),
      jobText: z.string().max(40000).default(""),
    })
    .strict(),
]);
export function POST(req: Request) {
  return aiRequest(req, async () => {
    const data = input.parse(await readJson(req));
    let result;
    if (data.source === "asset") {
      const asset = await ownedCvSource(data.id);
      result = analyzeAts(
        await inspectAtsDocument(asset.bytes, asset.name),
        data.jobText,
      );
    } else {
      const draft = await db.aiCvDraft.findUnique({
        where: { id: data.id },
        include: { review: true },
      });
      if (!draft || draft.state !== "succeeded" || !draft.content)
        throw new AppError("draft_not_found", 404);
      if (draft.revision !== data.revision)
        throw new AppError("revision_conflict", 409);
      const bytes = await renderDraftDocument(draft.document, draft.content);
      const { parser, verification } = await verifyCvExport(
        bytes,
        "tailored.docx",
        draft.content,
      );
      result = analyzeAts(
        parser,
        data.jobText,
        verification,
        [draft.review.resumeSnapshot, keywordEvidenceText(draft.review.checks)]
          .filter(Boolean)
          .join("\n"),
      );
    }
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
