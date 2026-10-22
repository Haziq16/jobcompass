import { generateText, Output } from "ai";
import { AppError } from "./contracts";
import {
  personalModel,
  type PersonalCredentials,
} from "./personal-ai-provider";
import { REVIEW_PROVIDER_TIMEOUT_MS } from "./personal-ai-timing";
import {
  originalOutput,
  originalSystem,
  originalText,
  type OriginalCvDocument,
  type ParagraphEdit,
  type DocxInspection,
} from "./original-cv-contracts";
import { validateRewrite } from "./tailored-cv-contracts";
import { editDocx, inspectDocx } from "./docx-template";
import { ownedCvSource } from "./cv-source";
export type OriginalTemplate = {
  sourceAssetId: string;
  sourceSha256: string;
  inspection: DocxInspection;
};
export async function generateOriginalCv(
  config: PersonalCredentials,
  jobText: string,
  template: OriginalTemplate,
) {
  const result = await generateText({
    model: personalModel(config),
    system: originalSystem,
    prompt: JSON.stringify({
      task: "tailored_cv_original",
      paragraphs: template.inspection.paragraphs,
      jobText,
    }),
    output: Output.object({ schema: originalOutput }),
    maxOutputTokens: 6500,
    maxRetries: 0,
    ...(config.provider === "openai"
      ? { providerOptions: { openai: { store: false } } }
      : {}),
    abortSignal: AbortSignal.timeout(REVIEW_PROVIDER_TIMEOUT_MS),
  });
  return {
    output: result.output,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  };
}
export async function validateOriginalCv(
  raw: unknown,
  template: OriginalTemplate,
): Promise<OriginalCvDocument> {
  const changes = originalOutput.parse(raw).replacements;
  const seen = new Set<string>();
  for (const change of changes) {
    const p = template.inspection.paragraphs.find((p) => p.id === change.id);
    if (!p?.editable || seen.has(change.id) || !change.text.trim())
      throw new AppError("cv_unsupported_source", 422);
    seen.add(change.id);
    validateRewrite(change.text, p.text);
    if (change.text.length > p.text.length * 1.25 + 30)
      throw new AppError("cv_layout_expansion", 422);
    if (
      (p.text.match(/\d+(?:[.,]\d+)*(?:\s*%)?/g) || []).some(
        (n) => !change.text.includes(n),
      )
    )
      throw new AppError("cv_unsupported_number", 422);
  }
  const doc: OriginalCvDocument = {
    format: "original-docx",
    sourceAssetId: template.sourceAssetId,
    sourceSha256: template.sourceSha256,
    findings: [],
    paragraphs: template.inspection.paragraphs.map((p) => ({
      ...p,
      original: p.text,
      text: changes.find((c) => c.id === p.id)?.text ?? p.text,
    })),
  };
  return updateOriginalCv(doc, changes, originalText(doc));
}
export async function updateOriginalCv(
  document: OriginalCvDocument,
  edits: ParagraphEdit[],
  content: string,
) {
  const ids = new Set(document.paragraphs.map((p) => p.id));
  if (
    new Set(edits.map((e) => e.id)).size !== edits.length ||
    edits.some((e) => !ids.has(e.id))
  )
    throw new AppError("invalid_paragraph", 400);
  const updated: OriginalCvDocument = {
    ...document,
    paragraphs: document.paragraphs.map((p) => ({
      ...p,
      text: edits.find((e) => e.id === p.id)?.text ?? p.text,
    })),
  };
  if (originalText(updated) !== content)
    throw new AppError("cv_content_mismatch", 409);
  const source = await ownedCvSource(
    updated.sourceAssetId,
    undefined,
    updated.sourceSha256,
  );
  const report = await inspectDocx(
    await editDocx(
      source.bytes,
      updated.paragraphs
        .filter((p) => p.text !== p.original)
        .map((p) => ({ id: p.id, text: p.text })),
    ),
  );
  return { ...updated, findings: report.findings };
}
