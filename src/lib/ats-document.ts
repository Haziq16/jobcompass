import { DOMParser } from "@xmldom/xmldom";
import { getDocumentProxy } from "unpdf";
import { AppError } from "./contracts";
import { openDocx, inspectDocx } from "./docx-template";
import { parseCvLines, type CvLine, type ParsedCv } from "./ats-analysis";
import { resumeChecks } from "./resume-checks";
import type { AtsFinding } from "./original-cv-contracts";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
type Element = Awaited<ReturnType<typeof openDocx>>["nodes"][number];
function paragraphText(p: Element) {
  return Array.from(p.getElementsByTagNameNS(W, "t"))
    .filter((t) => {
      let parent = t.parentNode;
      while (parent && parent !== p) {
        if (parent.nodeType === 1) {
          const element = parent as Element;
          if (element.localName === "p" || element.localName === "del")
            return false;
          if (
            element.localName === "r" &&
            Array.from(element.getElementsByTagNameNS(W, "vanish")).some(
              (n) =>
                !/^(?:0|false|off)$/i.test(
                  n.getAttributeNS(W, "val") || "true",
                ),
            )
          )
            return false;
        }
        parent = parent.parentNode;
      }
      return parent === p;
    })
    .map((t) => t.textContent || "")
    .join("");
}
const textFindings = (text: string): AtsFinding[] =>
  resumeChecks(text).checks.map((row) => ({
    id: row.id,
    label: row.label,
    status: row.status === "ok" ? "pass" : "review",
    detail: row.detail,
  }));
async function docx(bytes: Buffer) {
  const { zip, nodes } = await openDocx(bytes);
  const lines: Omit<CvLine, "section">[] = nodes.map((p, index) => ({
    id: "P" + String(index + 1).padStart(4, "0"),
    text: paragraphText(p),
    region: "body",
  }));
  let findings: AtsFinding[];
  try {
    findings = (await inspectDocx(bytes)).findings;
  } catch (e) {
    if (!(e instanceof AppError) || e.code !== "cv_no_text") throw e;
    findings = textFindings(lines.map((line) => line.text).join("\n"));
  }
  for (const file of Object.values(zip.files).filter((file) =>
    /^word\/(header|footer)\d*\.xml$/.test(file.name),
  )) {
    const document = new DOMParser().parseFromString(
      await file.async("string"),
      "application/xml",
    );
    const region = file.name.includes("header") ? "header" : "footer";
    for (const [index, p] of Array.from(
      document.getElementsByTagNameNS(W, "p"),
    ).entries())
      lines.push({
        id: file.name.replace(/[^a-z0-9]/gi, "") + "-" + (index + 1),
        text: paragraphText(p),
        region,
      });
  }
  const parsed = parseCvLines(lines, "docx", findings);
  if (!parsed.text.trim())
    parsed.findings.push({
      id: "image-only",
      label: "No usable body text",
      status: "review",
      detail:
        "The document has no readable body text. Header/footer content is shown separately.",
    });
  for (const finding of parsed.findings) {
    if (finding.status !== "review") continue;
    const tags = (
      {
        tables: ["tbl"],
        textboxes: ["txbxContent"],
        changes: ["ins", "del", "vanish"],
        images: ["drawing", "pict"],
      } as Record<string, string[]>
    )[finding.id];
    if (!tags) continue;
    finding.locations = nodes
      .flatMap((p, index) => {
        let parent = p.parentNode;
        let inside = tags.some((tag) =>
          Boolean(p.getElementsByTagNameNS(W, tag).length),
        );
        while (parent && !inside) {
          inside = tags.includes((parent as Element).localName || "");
          parent = parent.parentNode;
        }
        return inside ? ["P" + String(index + 1).padStart(4, "0")] : [];
      })
      .slice(0, 8);
  }
  return parsed;
}
async function pdf(bytes: Buffer) {
  const document = await getDocumentProxy(new Uint8Array(bytes), {
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    verbosity: 0,
  });
  const lines: Omit<CvLine, "section">[] = [];
  const findings: AtsFinding[] = [];
  let characters = 0;
  try {
    if (document.numPages > 40) throw new AppError("cv_too_many_pages", 400);
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      if (content.items.length > 20000)
        throw new AppError("cv_too_complex", 400);
      const spans: { text: string; x: number; y: number; right: number }[] = [];
      let current: Omit<CvLine, "section"> | null = null;
      let previousY = -Infinity,
        backwards = 0;
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        characters += item.str.length;
        if (characters > 80000) throw new AppError("cv_too_long", 400);
        const x = item.transform[4],
          y = viewport.height - item.transform[5];
        spans.push({ text: item.str, x, y, right: x + item.width });
        if (
          !current ||
          Math.abs((current.y || 0) - y) > 3 ||
          x - (spans.at(-2)?.right || x) > 50
        ) {
          if (y < previousY - 12) backwards++;
          previousY = y;
          current = {
            id: "PDF" + number + "-L" + (lines.length + 1),
            text: item.str,
            page: number,
            region: "body",
            x,
            y,
          };
          lines.push(current);
          if (lines.length > 3000) throw new AppError("cv_too_complex", 400);
        } else current.text += " " + item.str;
        if (item.hasEOL) current = null;
      }
      let gutterRows = 0;
      const rows = new Map<number, typeof spans>();
      for (const span of spans) {
        const key = Math.round(span.y / 3);
        const row = rows.get(key) || [];
        row.push(span);
        rows.set(key, row);
      }
      for (const row of rows.values()) {
        row.sort((a, b) => a.x - b.x);
        if (
          row.some(
            (span, index) =>
              index > 0 &&
              span.x - row[index - 1].right > viewport.width * 0.12 &&
              span.text.trim().split(/\s+/).length >= 3 &&
              row[index - 1].text.trim().split(/\s+/).length >= 3 &&
              !/^(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+)?(?:19|20)\d{2}\b/i.test(
                span.text,
              ),
          )
        )
          gutterRows++;
      }
      if (gutterRows >= 2)
        findings.push({
          id: "pdf-columns",
          label: "Possible multi-column reading order",
          status: "review",
          detail:
            "Separated text runs share multiple baselines on page " +
            number +
            ". This may also be an aligned list; compare the text preview.",
          locations: lines
            .filter((line) => line.page === number)
            .slice(0, 8)
            .map((line) => line.id),
        });
      if (backwards)
        findings.push({
          id: "pdf-order",
          label: "PDF text order needs review",
          status: "review",
          detail:
            "The text stream moves back up page " +
            number +
            " " +
            backwards +
            " time(s). Check whether related fields stay together.",
          locations: lines
            .filter((line) => line.page === number)
            .slice(0, 8)
            .map((line) => line.id),
        });
      if (!spans.length)
        findings.push({
          id: "image-only",
          label: "Page without a readable text layer",
          status: "review",
          detail:
            "Page " +
            number +
            " has no readable text. A blank page and a scanned page cannot be distinguished by this text check.",
          locations: ["page " + number],
        });
    }
    const parsed = parseCvLines(lines, "pdf", findings, document.numPages);
    parsed.findings.push(...textFindings(parsed.text));
    return parsed;
  } finally {
    await document.loadingTask.destroy();
  }
}
export async function inspectAtsDocument(
  bytes: Buffer,
  name: string,
): Promise<ParsedCv> {
  if (bytes.length > 3 * 1024 * 1024) throw new AppError("cv_too_large", 413);
  try {
    if (
      name.toLowerCase().endsWith(".docx") &&
      bytes[0] === 80 &&
      bytes[1] === 75
    )
      return await docx(bytes);
    if (
      name.toLowerCase().endsWith(".pdf") &&
      bytes.subarray(0, 5).toString() === "%PDF-"
    )
      return await pdf(bytes);
    throw new AppError("unsupported_cv", 400);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("cv_unreadable", 400);
  }
}
