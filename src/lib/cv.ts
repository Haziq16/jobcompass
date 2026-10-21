import { DOMParser } from "@xmldom/xmldom";
import pdf from "pdf-parse/lib/pdf-parse.js";
import JSZip from "jszip";
import { AppError, plainText } from "./contracts";
export async function extractCv(buffer: Buffer, name: string) {
  if (buffer.length > 5 * 1024 * 1024) throw new AppError("cv_too_large");
  try {
    let text: string;
    if (
      name.toLowerCase().endsWith(".pdf") &&
      buffer.subarray(0, 5).toString() === "%PDF-"
    )
      text = (await pdf(buffer)).text;
    else if (
      name.toLowerCase().endsWith(".docx") &&
      buffer[0] === 80 &&
      buffer[1] === 75
    ) {
      const zip = await JSZip.loadAsync(buffer);
      let total = 0;
      for (const entry of Object.values(zip.files)) {
        const size =
          (entry as unknown as { _data?: { uncompressedSize?: number } })._data
            ?.uncompressedSize || 0;
        total += size;
        if (
          total > 20 * 1024 * 1024 ||
          /vbaProject|embeddings\//i.test(entry.name)
        )
          throw new AppError("unsupported_cv");
      }
      if (!zip.file("word/document.xml") || !zip.file("[Content_Types].xml"))
        throw new AppError("unsupported_cv");
      const xml = await zip.file("word/document.xml")!.async("string");
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new AppError("unsupported_cv");
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      text = Array.from(doc.getElementsByTagName("w:p"))
        .map((p) => p.textContent)
        .join("\n");
    } else throw new AppError("unsupported_cv");
    text = plainText(text).slice(0, 80000);
    if (!text.trim()) throw new AppError("cv_no_text");
    return text;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("cv_unreadable");
  }
}
