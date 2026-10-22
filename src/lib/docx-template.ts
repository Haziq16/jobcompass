import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { AppError } from "./contracts";
import { resumeChecks } from "./resume-checks";
import type { DocxInspection, ParagraphEdit } from "./original-cv-contracts";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const parse = (text: string) => {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new AppError("unsupported_cv", 400);
  const doc = new DOMParser({
    onError: () => {
      throw new AppError("cv_unreadable", 400);
    },
  }).parseFromString(text, "application/xml");
  return doc;
};
export async function openDocx(bytes: Buffer) {
  if (bytes.length > 3 * 1024 * 1024) throw new AppError("cv_too_large", 413);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new AppError("unsupported_cv", 400);
  }
  const entries = Object.values(zip.files);
  let expanded = 0;
  if (entries.length > 1000) throw new AppError("unsupported_cv", 400);
  for (const file of entries) {
    expanded +=
      (file as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize || 0;
    if (
      expanded > 20 * 1024 * 1024 ||
      /vbaProject|embeddings\/|activeX\/|afchunk|altchunk/i.test(file.name)
    )
      throw new AppError("unsupported_cv", 400);
    if (/\.(xml|rels)$/i.test(file.name)) {
      const xml = await file.async("string");
      if (/<!DOCTYPE|<!ENTITY|<\w+:altChunk/i.test(xml))
        throw new AppError("unsupported_cv", 400);
      if (file.name.endsWith(".rels"))
        for (const rel of Array.from(
          parse(xml).getElementsByTagName("Relationship"),
        )) {
          if (
            rel.getAttribute("TargetMode") === "External" &&
            (!rel.getAttribute("Type")?.endsWith("/hyperlink") ||
              !/^(https?:|mailto:)/i.test(rel.getAttribute("Target") || ""))
          )
            throw new AppError("unsupported_cv", 400);
        }
    }
  }
  if (!zip.file("word/document.xml") || !zip.file("[Content_Types].xml"))
    throw new AppError("unsupported_cv", 400);
  const doc = parse(await zip.file("word/document.xml")!.async("string"));
  const nodes = Array.from(doc.getElementsByTagNameNS(W, "p"));
  if (nodes.length > 500) throw new AppError("cv_too_long", 400);
  return { zip, doc, nodes };
}
export async function inspectDocx(bytes: Buffer): Promise<DocxInspection> {
  const { zip, doc, nodes } = await openDocx(bytes);
  const paragraphs = nodes.map((node, i) => {
    const text = Array.from(node.getElementsByTagNameNS(W, "t"))
      .map((t) => t.textContent || "")
      .join("");
    const editable =
      i > 1 &&
      text.trim().split(/\s+/).length >= 9 &&
      text.length <= 2200 &&
      !/[^\s@]+@[^\s@]+|https?:\/\//i.test(text) &&
      !node.getElementsByTagNameNS(W, "fldChar").length &&
      !node.getElementsByTagNameNS(W, "drawing").length &&
      !node.getElementsByTagNameNS(W, "txbxContent").length;
    return { id: `P${String(i + 1).padStart(4, "0")}`, text, editable };
  });
  const text = paragraphs
    .map((p) => p.text)
    .join("\n")
    .trim();
  if (text.length < 100) throw new AppError("cv_no_text", 400);
  if (text.length > 40000) throw new AppError("cv_too_long", 400);
  const count = (name: string) => doc.getElementsByTagNameNS(W, name).length;
  const headerParts = await Promise.all(
    Object.values(zip.files)
      .filter((f) => /^word\/(header|footer)\d*\.xml$/.test(f.name))
      .map((f) => f.async("string")),
  );
  const hiddenContact = headerParts.some((x) =>
    /[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}/i.test(x),
  );
  const columns = Array.from(doc.getElementsByTagNameNS(W, "cols")).some(
    (n) =>
      Number(n.getAttributeNS(W, "num") || n.getAttribute("w:num") || "1") > 1,
  );
  const findings = [
    {
      id: "size",
      label: "Employer file-size compatibility",
      status: bytes.length <= 2.5 * 1024 * 1024 ? "pass" : "review",
      detail:
        bytes.length <= 2.5 * 1024 * 1024
          ? "Below Greenhouse’s documented 2.5 MB parsing limit."
          : "Above Greenhouse’s 2.5 MB parsing limit. Reduce embedded images before applying.",
    },
    {
      id: "tables",
      label: "Tables",
      status: count("tbl") ? "review" : "pass",
      detail: count("tbl")
        ? `${count("tbl")} table(s) found. Check that extracted text keeps roles and dates together.`
        : "No tables found in the main document.",
    },
    {
      id: "columns",
      label: "Reading order",
      status: columns ? "review" : "pass",
      detail: columns
        ? "Multiple page columns found. Some parsers can mix their reading order."
        : "No multi-column section settings found.",
    },
    {
      id: "textboxes",
      label: "Text boxes",
      status: count("txbxContent") ? "review" : "pass",
      detail: count("txbxContent")
        ? "Text boxes can be omitted or reordered by parsers."
        : "No Word text boxes found.",
    },
    {
      id: "images",
      label: "Images and graphics",
      status: count("drawing") || count("pict") ? "review" : "pass",
      detail:
        count("drawing") || count("pict")
          ? "Graphics are retained. Check that important facts also appear as selectable text."
          : "No drawings or pictures found in the main document.",
    },
    {
      id: "contact-region",
      label: "Contact details in the main body",
      status: hiddenContact ? "review" : "pass",
      detail: hiddenContact
        ? "An email appears in a header/footer. Some parsers omit this region."
        : "No email-shaped contact data detected in headers or footers.",
    },
    {
      id: "changes",
      label: "Tracked changes and hidden text",
      status:
        count("ins") || count("del") || count("vanish") ? "review" : "pass",
      detail:
        count("ins") || count("del") || count("vanish")
          ? "Review tracked changes/hidden text in Word before using this CV."
          : "No tracked insertions/deletions or explicit hidden-text markers found.",
    },
    ...resumeChecks(text).checks.map((c) => ({
      id: c.id,
      label: c.label,
      status: c.status === "ok" ? "pass" : "review",
      detail: c.detail,
    })),
  ] as DocxInspection["findings"];
  return {
    text,
    paragraphs,
    findings,
    passed: findings.filter((f) => f.status === "pass").length,
    total: findings.length,
  };
}
// Match unchanged words to their original text runs; insertions inherit the
// nearest run. Paragraph/run properties, styles and every other ZIP part remain.
export async function editDocx(bytes: Buffer, edits: ParagraphEdit[]) {
  const { zip, doc, nodes } = await openDocx(bytes);
  const seen = new Set<string>();
  for (const edit of edits) {
    if (seen.has(edit.id)) throw new AppError("duplicate_paragraph", 400);
    seen.add(edit.id);
    const i = Number(edit.id.slice(1)) - 1;
    const p = nodes[i];
    if (
      !p ||
      edit.text.length > 3000 ||
      [...edit.text].some(
        (char) =>
          char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0)),
      )
    )
      throw new AppError("invalid_paragraph", 400);
    const runs = Array.from(p.getElementsByTagNameNS(W, "t"));
    const original = runs.map((n) => n.textContent || "").join("");
    if (original === edit.text) continue;
    if (!runs.length) throw new AppError("invalid_paragraph", 400);
    const tokens = (s: string) => s.match(/\S+\s*|\s+/g) || [];
    const a: { word: string; run: number }[] = [];
    let offset = 0;
    const boundaries = runs.map((n) => {
      offset += (n.textContent || "").length;
      return offset;
    });
    let start = 0;
    for (const word of tokens(original)) {
      const run = Math.max(
        0,
        boundaries.findIndex((end) => end > start),
      );
      a.push({ word, run });
      start += word.length;
    }
    const b = tokens(edit.text);
    if (a.length * b.length > 2000000)
      throw new AppError("cv_paragraph_too_complex", 400);
    const matrix = Array.from(
      { length: a.length + 1 },
      () => new Uint16Array(b.length + 1),
    );
    for (let x = a.length - 1; x >= 0; x--)
      for (let y = b.length - 1; y >= 0; y--)
        matrix[x][y] =
          a[x].word.trim() === b[y].trim()
            ? matrix[x + 1][y + 1] + 1
            : Math.max(matrix[x + 1][y], matrix[x][y + 1]);
    const assigned = new Array<number>(b.length).fill(-1);
    let x = 0,
      y = 0;
    let replacementRun: number | undefined;
    while (x < a.length && y < b.length) {
      if (a[x].word.trim() === b[y].trim()) {
        assigned[y] = a[x].run;
        replacementRun = undefined;
        x++;
        y++;
      } else if (matrix[x + 1][y] >= matrix[x][y + 1]) {
        replacementRun ??= a[x].run;
        x++;
      } else {
        assigned[y] = replacementRun ?? a[x].run;
        y++;
      }
    }
    for (let j = 0; j < assigned.length; j++)
      if (assigned[j] < 0)
        assigned[j] = replacementRun ?? a[Math.min(x, a.length - 1)]?.run ?? 0;
    const values = runs.map(() => "");
    b.forEach((word, j) => (values[Math.max(0, assigned[j])] += word));
    runs.forEach((node, j) => {
      node.textContent = values[j];
      node.setAttribute("xml:space", "preserve");
    });
  }
  zip.file("word/document.xml", new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
