import JSZip from "jszip";
// Fictional Word source shared by isolated tests; no private user documents.
export async function cvLayoutFixture({
  columns = false,
  tables = false,
  headerContact = false,
} = {}) {
  const zip = new JSZip();
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/_rels/document.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="header" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="footer" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>',
  );
  zip.file(
    "word/styles.xml",
    `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="22"/><w:color w:val="153E35"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="CustomTitle"><w:name w:val="Custom title"/><w:rPr><w:b/><w:sz w:val="40"/></w:rPr><w:pPr><w:spacing w:after="120"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="CustomHeading"><w:name w:val="Custom heading"/><w:rPr><w:b/><w:color w:val="26725C"/></w:rPr><w:pPr><w:spacing w:before="180" w:after="100"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:color="26725C"/></w:pBdr></w:pPr></w:style></w:styles>`,
  );
  const p = (text, style) =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t>${text}</w:t></w:r></w:p>`;
  const rows = [
    p("Alex Morgan", "CustomTitle"),
    p("alex@release.example"),
    p("EXPERIENCE", "CustomHeading"),
    p("Android Engineer · Example Studio · 2021–2025"),
    '<w:p><w:pPr><w:spacing w:after="100"/></w:pPr><w:r><w:t xml:space="preserve">Built </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Kotlin </w:t></w:r><w:r><w:t>services with PostgreSQL and Docker at Example Studio, improving response times by 20%.</w:t></w:r></w:p>',
    p("EDUCATION", "CustomHeading"),
    p("BSc Computer Science, Example University, 2020."),
    p("SKILLS", "CustomHeading"),
    p("Kotlin, PostgreSQL, Docker, Android"),
  ];
  zip.file(
    "word/header1.xml",
    `<w:hdr xmlns:w="${W}">${p(headerContact ? "alex@release.example" : "Alex Morgan · Engineering")}</w:hdr>`,
  );
  zip.file(
    "word/footer1.xml",
    `<w:ftr xmlns:w="${W}">${p("Alex Morgan · CV")}</w:ftr>`,
  );
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${rows.join("")}${tables ? `<w:tbl><w:tr><w:tc>${p("Additional experience")}</w:tc></w:tr></w:tbl>` : ""}<w:sectPr><w:headerReference w:type="default" r:id="header"/><w:footerReference w:type="default" r:id="footer"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1050" w:right="900" w:bottom="1050" w:left="900"/><w:cols w:num="${columns ? 2 : 1}"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
