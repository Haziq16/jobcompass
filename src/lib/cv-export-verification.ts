import { createHash } from "node:crypto";
import { inspectAtsDocument } from "./ats-document";
import { AppError } from "./contracts";
import { cvDocumentBytes } from "./tailored-cv-document";
import { isOriginalCv } from "./original-cv-contracts";
import { ownedCvSource } from "./cv-source";
import { editDocx } from "./docx-template";
import type { ExportVerification } from "./ats-analysis";
const normalize = (text: string) =>
  text.normalize("NFKC").replace(/\s+/g, " ").trim();
const hash = (text: string | Buffer) =>
  createHash("sha256").update(text).digest("hex");
export async function verifyCvExport(
  bytes: Buffer,
  name: string,
  expected: string,
) {
  const parser = await inspectAtsDocument(bytes, name);
  const a = normalize(expected),
    b = normalize(parser.text);
  const counts = (text: string) => {
    const map = new Map<string, number>();
    for (const word of text.split(" ").filter(Boolean))
      map.set(word, (map.get(word) || 0) + 1);
    return map;
  };
  const wanted = counts(a),
    found = counts(b);
  let missingWords = 0,
    addedWords = 0;
  for (const [word, count] of wanted)
    missingWords += Math.max(0, count - (found.get(word) || 0));
  for (const [word, count] of found)
    addedWords += Math.max(0, count - (wanted.get(word) || 0));
  const reordered = a !== b && !missingWords && !addedWords;
  const verification: ExportVerification = {
    state: a && a === b ? "verified" : "mismatch",
    expectedHash: hash(a),
    extractedHash: hash(b),
    fileHash: hash(bytes),
    missingWords,
    addedWords,
    reordered,
    detail:
      a && a === b
        ? "The exported file's readable body text matches the saved wording in order. Layout risks still need review."
        : missingWords +
          " missing word occurrence(s), " +
          addedWords +
          " additional occurrence(s)" +
          (reordered
            ? "; word order changed."
            : ". Content differs from the saved wording."),
  };
  return { parser, verification };
}
export function requireVerifiedExport(verification: ExportVerification) {
  if (verification.state !== "verified")
    throw new AppError("cv_export_mismatch", 422);
}
export async function renderDraftDocument(
  document: unknown,
  content: string,
): Promise<Buffer> {
  if (!isOriginalCv(document)) return cvDocumentBytes(content);
  const source = await ownedCvSource(
    document.sourceAssetId,
    undefined,
    document.sourceSha256,
  );
  return editDocx(
    source.bytes,
    document.paragraphs
      .filter((p) => p.text !== p.original)
      .map((p) => ({ id: p.id, text: p.text })),
  );
}
