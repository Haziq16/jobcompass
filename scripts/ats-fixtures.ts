import JSZip from "jszip";
import { cvLayoutFixture } from "./cv-layout-fixture.mjs";
import { cvDocumentBytes } from "../src/lib/tailored-cv-document";
export const sampleText =
  "Jordan Ellis\njordan@example.test\n+91 98765 43210\nEXPERIENCE\nSoftware Engineer | Cedar Systems | 2021-2025\nBuilt TypeScript services with Docker for a product team.\nEDUCATION\nBSc Computer Science | Meadow University | 2020\nSKILLS\nTypeScript, Docker, PostgreSQL";
type Field = { kind: string; value: string };
export type AtsFixture = {
  id: string;
  name: string;
  bytes: Buffer;
  expected: Field[];
  flags: string[];
  forbiddenFlags?: string[];
};
const fields: Field[] = [
  { kind: "name", value: "Jordan Ellis" },
  { kind: "email", value: "jordan@example.test" },
  { kind: "jobTitle", value: "Software Engineer" },
  { kind: "employer", value: "Cedar Systems" },
  { kind: "degree", value: "BSc Computer Science | Meadow University | 2020" },
];
// Synthetic in-memory PDF fixture, never a production document exporter.
export function pdfFixture(pages: { text: string; x: number; y: number }[][]) {
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const pageRefs: string[] = [];
  for (const page of pages) {
    const stream = page
      .map(
        (line) =>
          "BT /F1 11 Tf " +
          line.x +
          " " +
          line.y +
          " Td (" +
          line.text.replace(/[\\()]/g, "\\$&") +
          ") Tj ET",
      )
      .join("\n");
    const pageId = objects.length + 1,
      streamId = pageId + 1;
    objects.push(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents " +
        streamId +
        " 0 R >>",
    );
    objects.push(
      "<< /Length " +
        Buffer.byteLength(stream) +
        " >>\nstream\n" +
        stream +
        "\nendstream",
    );
    pageRefs.push(pageId + " 0 R");
  }
  objects[1] =
    "<< /Type /Pages /Count " +
    pages.length +
    " /Kids [" +
    pageRefs.join(" ") +
    "] >>";
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output));
    output += index + 1 + " 0 obj\n" + object + "\nendobj\n";
  }
  const xref = Buffer.byteLength(output);
  output +=
    "xref\n0 " +
    (objects.length + 1) +
    "\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
      .join("") +
    "trailer\n<< /Size " +
    (objects.length + 1) +
    " /Root 1 0 R >>\nstartxref\n" +
    xref +
    "\n%%EOF";
  return Buffer.from(output);
}
export async function atsFixtures(): Promise<AtsFixture[]> {
  const cleanPdf = sampleText
    .split("\n")
    .map((text, index) => ({ text, x: 40, y: 750 - index * 24 }));
  const clean = await cvDocumentBytes(sampleText);
  const variants: AtsFixture[] = [
    {
      id: "word-single",
      name: "single.docx",
      bytes: clean,
      expected: fields,
      flags: [],
      forbiddenFlags: ["columns", "textboxes", "tables"],
    },
    {
      id: "pdf-single",
      name: "single.pdf",
      bytes: pdfFixture([cleanPdf]),
      expected: fields,
      flags: [],
      forbiddenFlags: ["pdf-columns", "pdf-order", "image-only"],
    },
    {
      id: "pdf-multipage",
      name: "multi.pdf",
      bytes: pdfFixture([
        cleanPdf.slice(0, 6),
        cleanPdf
          .slice(6)
          .map((line, index) => ({ ...line, y: 750 - index * 24 })),
      ]),
      expected: fields,
      flags: [],
      forbiddenFlags: ["pdf-columns", "pdf-order"],
    },
    {
      id: "pdf-two-columns",
      name: "columns.pdf",
      bytes: pdfFixture([
        [
          { text: "Jordan Ellis", x: 40, y: 750 },
          { text: "Built reliable web services", x: 40, y: 700 },
          { text: "Designed reliable mobile applications", x: 370, y: 700 },
          { text: "Used Docker for deployment", x: 40, y: 670 },
          { text: "Managed product engineering projects", x: 370, y: 670 },
        ],
      ]),
      expected: fields.slice(0, 1),
      flags: ["pdf-columns"],
    },
    {
      id: "pdf-reversed-order",
      name: "reordered.pdf",
      bytes: pdfFixture([
        [
          cleanPdf[0],
          { text: "jordan@example.test", x: 40, y: 600 },
          { text: "EXPERIENCE", x: 40, y: 700 },
        ],
      ]),
      expected: fields.slice(0, 2),
      flags: ["pdf-order"],
    },
    {
      id: "pdf-no-text",
      name: "scan.pdf",
      bytes: pdfFixture([[]]),
      expected: [],
      flags: ["image-only"],
    },
    {
      id: "word-unicode",
      name: "unicode.docx",
      bytes: await cvDocumentBytes(
        sampleText.replaceAll("Jordan Ellis", "Jos\u00e9 N\u00fa\u00f1ez"),
      ),
      expected: [
        { kind: "name", value: "Jos\u00e9 N\u00fa\u00f1ez" },
        ...fields.slice(1),
      ],
      flags: [],
    },
    {
      id: "word-encoded-symbols",
      name: "symbols.docx",
      bytes: await cvDocumentBytes(
        sampleText.replace("Cedar Systems", "Cedar & Pine <Systems>"),
      ),
      expected: fields.map((field) =>
        field.kind === "employer"
          ? { ...field, value: "Cedar & Pine <Systems>" }
          : field,
      ),
      flags: [],
    },
    {
      id: "word-missing-fields",
      name: "missing.docx",
      bytes: await cvDocumentBytes(
        "Jordan Ellis\nEXPERIENCE\nBuilt software for a community project with Docker and TypeScript.\nSKILLS\nDocker, TypeScript",
      ),
      expected: fields.slice(0, 1),
      flags: ["email", "sections"],
    },
  ];
  const heldOut = [
    {
      id: "word-separate-role-lines",
      text: "Maya Raman\nmaya@example.test\nWORK EXPERIENCE\nBackend Engineer\nMaple Technologies\nMarch 2022 - Present\nImplemented Python services and deployed Docker containers.\nEDUCATION\nMaster of Science, North University, 2021\nSKILLS\nPython, Docker",
      expected: [
        { kind: "name", value: "Maya Raman" },
        { kind: "email", value: "maya@example.test" },
        { kind: "jobTitle", value: "Backend Engineer" },
        { kind: "employer", value: "Maple Technologies" },
        { kind: "degree", value: "Master of Science, North University, 2021" },
      ],
    },
    {
      id: "word-no-section-headings",
      text: "Amir Khan\namir@example.test\nSoftware Developer at Orbit Works\nBuilt Java services for a retail product from 2019 to 2023.\nBachelor of Technology, Lake University, 2018\nJava, SQL, PostgreSQL",
      expected: [
        { kind: "name", value: "Amir Khan" },
        { kind: "email", value: "amir@example.test" },
        { kind: "jobTitle", value: "Software Developer" },
        { kind: "employer", value: "Orbit Works" },
        {
          kind: "degree",
          value: "Bachelor of Technology, Lake University, 2018",
        },
      ],
    },
    {
      id: "word-contact-heading",
      text: "CONTACT DETAILS\nElena Rossi\nelena@example.test\nEXPERIENCE\nData Analyst | Willow Analytics | 2019-2024\nDeveloped Python reporting tools using SQL.\nEDUCATION\nBachelor of Science, Valley University, 2018\nSKILLS\nPython, SQL",
      expected: [
        { kind: "name", value: "Elena Rossi" },
        { kind: "email", value: "elena@example.test" },
        { kind: "jobTitle", value: "Data Analyst" },
        { kind: "employer", value: "Willow Analytics" },
        {
          kind: "degree",
          value: "Bachelor of Science, Valley University, 2018",
        },
      ],
    },
    {
      id: "word-non-english-headings",
      text: "Ana Costa\nana@example.test\nEXPERIENCIA PROFISSIONAL\nSoftware Engineer | Horizonte Sistemas | 2020-2025\nDesenvolveu servicos Python com Docker.\nFORMACAO\nBachelor of Science, Universidade Central, 2019\nCOMPETENCIAS\nPython, Docker",
      expected: [
        { kind: "name", value: "Ana Costa" },
        { kind: "email", value: "ana@example.test" },
        { kind: "jobTitle", value: "Software Engineer" },
        { kind: "employer", value: "Horizonte Sistemas" },
        {
          kind: "degree",
          value: "Bachelor of Science, Universidade Central, 2019",
        },
      ],
    },
  ];
  for (const fixture of heldOut)
    variants.push({
      id: fixture.id,
      name: fixture.id + ".docx",
      bytes: await cvDocumentBytes(fixture.text),
      expected: fixture.expected,
      flags: [],
    });
  variants.push({
    id: "pdf-right-aligned-dates",
    name: "dates.pdf",
    bytes: pdfFixture([
      [
        { text: "Jordan Ellis", x: 40, y: 750 },
        { text: "Software Engineer Cedar Systems", x: 40, y: 700 },
        { text: "Jan 2021 Present", x: 420, y: 700 },
        { text: "Developer Product Team Orbit", x: 40, y: 670 },
        { text: "Jan 2019 Dec 2020", x: 420, y: 670 },
      ],
    ]),
    expected: fields.slice(0, 1),
    flags: [],
    forbiddenFlags: ["pdf-columns"],
  });
  for (const [id, options, flags] of [
    ["word-columns", { columns: true }, ["columns"]],
    ["word-table", { tables: true }, ["tables"]],
    ["word-header-contact", { headerContact: true }, ["contact-region"]],
  ] as const)
    variants.push({
      id,
      name: id + ".docx",
      bytes: await cvLayoutFixture(options),
      expected: [
        { kind: "name", value: "Alex Morgan" },
        { kind: "email", value: "alex@release.example" },
        { kind: "jobTitle", value: "Android Engineer" },
        { kind: "employer", value: "Example Studio" },
        {
          kind: "degree",
          value: "BSc Computer Science, Example University, 2020.",
        },
      ],
      flags: [...flags],
    });
  for (const [id, addition, flag] of [
    [
      "word-hidden-text",
      "<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>Hidden claim</w:t></w:r></w:p>",
      "changes",
    ],
    [
      "word-tracked-delete",
      "<w:p><w:del><w:r><w:t>Removed claim</w:t></w:r></w:del></w:p>",
      "changes",
    ],
    [
      "word-text-box",
      "<w:p><w:r><w:txbxContent><w:p><w:r><w:t>Text box claim</w:t></w:r></w:p></w:txbxContent></w:r></w:p>",
      "textboxes",
    ],
  ]) {
    const zip = await JSZip.loadAsync(clean);
    const xml = await zip.file("word/document.xml")!.async("string");
    zip.file(
      "word/document.xml",
      xml.replace("<w:sectPr>", addition + "<w:sectPr>"),
    );
    variants.push({
      id,
      name: id + ".docx",
      bytes: await zip.generateAsync({ type: "nodebuffer" }),
      expected: fields,
      flags: [flag],
    });
  }
  return variants;
}
