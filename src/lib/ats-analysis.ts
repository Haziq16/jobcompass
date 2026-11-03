import { resumeChecks, cvSkillSignals } from "./resume-checks";
import type { AtsFinding } from "./original-cv-contracts";
export const ATS_VERSION = "2026-11-03.1";
export type CvLine = {
  id: string;
  text: string;
  section: string;
  page?: number;
  region?: "body" | "header" | "footer";
  x?: number;
  y?: number;
};
export type ParsedField = {
  kind: string;
  value: string;
  sourceIds: string[];
  confidence: "detected" | "candidate";
};
export type ParsedCv = {
  version: string;
  format: "text" | "pdf" | "docx";
  text: string;
  lines: CvLine[];
  fields: ParsedField[];
  findings: AtsFinding[];
  pageCount: number | null;
  limitations: string[];
};
export type Requirement = {
  id: string;
  text: string;
  priority: "required" | "preferred" | "unspecified";
  terms: string[];
  assessment: "evidence" | "mention" | "not_found" | "confirm";
  evidence: { lineId: string; quote: string }[];
  explanation: string;
};
export type AtsIssue = {
  id: string;
  severity: "high" | "medium" | "low";
  label: string;
  detail: string;
  locations: string[];
  action: string;
};
export type ExportVerification = {
  state: "verified" | "mismatch";
  expectedHash: string;
  extractedHash: string;
  fileHash: string;
  missingWords: number;
  addedWords: number;
  reordered: boolean;
  detail: string;
};
export type AtsAnalysis = {
  version: string;
  parser: ParsedCv;
  issues: AtsIssue[];
  requirements: Requirement[];
  verification?: ExportVerification;
};
const headingPatterns: [string, RegExp][] = [
  ["Contact", /^(?:contact|contact details|personal details)$/i],
  [
    "Experience",
    /^(?:(?:work|professional|employment|additional) )?(?:experience|history)$/i,
  ],
  ["Education", /^(?:education|academic background|qualifications)$/i],
  [
    "Skills",
    /^(?:(?:technical|core|key) )?(?:skills|competencies|technologies)$/i,
  ],
  ["Projects", /^(?:(?:personal|selected|key) )?projects$/i],
  ["Summary", /^(?:summary|profile|professional summary|objective|about me)$/i],
  ["Certifications", /^(?:certifications?|licen[cs]es?)$/i],
];
export function sectionHeading(text: string) {
  return headingPatterns.find(([, rx]) =>
    rx.test(text.trim().replace(/:$/, "")),
  )?.[0];
}
const negated = (text: string) =>
  /\b(?:no|not|never|without|learning|want to learn|interested in)\b|haven['\u2019]t/i.test(
    text,
  );
export function parseCvLines(
  input: Omit<CvLine, "section">[],
  format: ParsedCv["format"] = "text",
  findings: AtsFinding[] = [],
  pageCount: number | null = null,
): ParsedCv {
  let section = "Contact";
  const lines = input
    .filter((line) => line.text.trim())
    .map((line) => {
      if (!line.region || line.region === "body")
        section = sectionHeading(line.text) || section;
      return {
        ...line,
        text: line.text.trim(),
        section: line.region && line.region !== "body" ? line.region : section,
      };
    });
  const body = lines.filter((line) => !line.region || line.region === "body");
  const text = body.map((line) => line.text).join("\n");
  const fields: ParsedField[] = [];
  const add = (
    kind: string,
    value: string,
    line: CvLine,
    confidence: ParsedField["confidence"] = "detected",
  ) => {
    if (
      !fields.some(
        (field) =>
          field.kind === kind &&
          field.value === value &&
          field.sourceIds.includes(line.id),
      )
    )
      fields.push({ kind, value, sourceIds: [line.id], confidence });
  };
  for (const line of lines) {
    for (const match of line.text.matchAll(/[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}/gi))
      add("email", match[0], line);
    for (const match of line.text.matchAll(/(?:https?:\/\/|www\.)[^\s<>]+/gi))
      add("link", match[0], line);
    for (const match of line.text.matchAll(/\+?\d[\d ()-]{7,}\d/g)) {
      const length = match[0].replace(/\D/g, "").length;
      if (length >= 10 && length <= 15)
        add("phone", match[0], line, "candidate");
    }
    for (const match of line.text.matchAll(
      /\b(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?(?:19|20)\d{2}(?:\s*[-\u2013\u2014]\s*(?:Present|Current|(?:19|20)\d{2}))?/gi,
    ))
      add("date", match[0], line);
    if (
      line.section === "Education" &&
      !sectionHeading(line.text) &&
      /\b(?:BSc|BEng|BTech|MSc|MEng|MBA|PhD|bachelor|master|doctor|degree|diploma)\b/i.test(
        line.text,
      )
    )
      add("degree", line.text, line, "candidate");
    if (line.section === "Experience" && !sectionHeading(line.text)) {
      const parts = line.text.split(/\s+(?:at|\||\u00b7)\s+/);
      if (
        parts.length >= 2 &&
        /\b(?:engineer|developer|manager|analyst|designer|scientist|consultant|nurse|director|intern|specialist|associate)\b/i.test(
          parts[0],
        )
      ) {
        add("jobTitle", parts[0], line, "candidate");
        if (!/^(?:19|20)\d{2}/.test(parts[1]))
          add("employer", parts[1], line, "candidate");
      }
    }
    if (!negated(line.text))
      for (const skill of cvSkillSignals(line.text))
        add("skill", skill, line, "candidate");
  }
  const name = body
    .slice(0, 4)
    .find(
      (line) =>
        !sectionHeading(line.text) &&
        /^[\p{L}][\p{L} .'\u2019-]{2,70}$/u.test(line.text) &&
        line.text.split(/\s+/).length >= 2 &&
        line.text.split(/\s+/).length <= 5 &&
        !/\b(?:engineer|developer|curriculum|resume|vitae|manager|skills|summary)\b/i.test(
          line.text,
        ),
    );
  if (name) add("name", name.text, name, "candidate");
  return {
    version: ATS_VERSION,
    format,
    text,
    lines,
    fields,
    findings,
    pageCount,
    limitations: [
      "Extracted fields are parser candidates, not confirmed application answers.",
      "This is an English-focused diagnostic, not an employer's parser or an ATS pass score.",
      ...(format === "text"
        ? ["Text alone cannot verify layout, reading order or page count."]
        : []),
      ...(format === "pdf"
        ? [
            "PDF reading order comes from its text layer; scanned content needs OCR or a text-based source.",
          ]
        : []),
    ],
  };
}
export function parseCvText(text: string) {
  return parseCvLines(
    text
      .slice(0, 80000)
      .split(/\r?\n/)
      .map((text, index) => ({
        id: "L" + String(index + 1).padStart(4, "0"),
        text,
        region: "body" as const,
      })),
  );
}
export function jobRequirements(job: string, parser: ParsedCv): Requirement[] {
  let priority: Requirement["priority"] = "unspecified";
  const results: Requirement[] = [];
  const body = parser.lines.filter(
    (item) => !item.region || item.region === "body",
  );
  const lineTerms = new Map(
    body.map((item) => [
      item.id,
      new Set(
        resumeChecks(item.text, job)
          .keywords.filter((k) => k.mentioned)
          .map((k) => k.name),
      ),
    ]),
  );
  for (const line of job.slice(0, 40000).split(/\r?\n/)) {
    if (
      /^(?:preferred|desirable|nice.to.have|bonus)(?: qualifications| skills| requirements)?\s*:?$/i.test(
        line.trim(),
      )
    ) {
      priority = "preferred";
      continue;
    }
    if (
      /^(?:required|minimum|essential|must.have)(?: qualifications| skills| requirements)?\s*:?$/i.test(
        line.trim(),
      ) ||
      /^requirements\s*:?$/i.test(line.trim())
    ) {
      priority = "required";
      continue;
    }
    if (
      /^(?:benefits|about us|responsibilities|what we offer|about the company)\s*:?$/i.test(
        line.trim(),
      )
    ) {
      priority = "unspecified";
      continue;
    }
    for (const clause of line.split(/;\s*|(?<=[.!?])\s+(?=[A-Z])/)) {
      const text = clause.trim().replace(/^[-*\u2022]\s*/, "");
      if (text.length < 8 || results.length >= 60) continue;
      const terms = resumeChecks("", text).keywords.map((item) => item.name);
      const personal =
        /\b(?:citizen|citizenship|clearance|sponsor|visa|work authori[sz]|legally authori[sz])\b/i.test(
          text,
        );
      const years = text.match(/\b(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\b/i);
      const degree =
        /\b(?:bachelor|master|doctorate|phd|degree|bsc|btech|msc)\b/i.test(
          text,
        );
      const localPriority =
        /\b(?:preferred|desirable|bonus|nice.to.have|optional|not required)\b/i.test(
          text,
        )
          ? "preferred"
          : /\b(?:must|required|minimum|essential|need to)\b/i.test(text)
            ? "required"
            : priority;
      if (
        !terms.length &&
        !personal &&
        !years &&
        !degree &&
        localPriority === "unspecified"
      )
        continue;
      const matching = (item: CvLine, term: string) =>
        lineTerms.get(item.id)?.has(term) === true;
      const termRows = body.filter((item) =>
        terms.some((term) => matching(item, term)),
      );
      const positive = termRows.filter((item) => !negated(item.text));
      const covered = terms.every((term) =>
        positive.some((item) => matching(item, term)),
      );
      const demonstrated =
        covered &&
        terms.length > 0 &&
        terms.every((term) =>
          positive.some(
            (item) =>
              ["Experience", "Projects"].includes(item.section) &&
              /\b(?:built|developed|implemented|used|delivered|designed|maintained|managed|led|created|deployed|tested)\b/i.test(
                item.text,
              ) &&
              matching(item, term),
          ),
        );
      let assessment: Requirement["assessment"] = demonstrated
        ? "evidence"
        : covered && terms.length
          ? "mention"
          : "not_found";
      let explanation = demonstrated
        ? "Relevant experience wording was found. Confirm its meaning and accuracy."
        : covered && terms.length
          ? "Terms are mentioned, but this does not establish proficiency or experience."
          : "No complete supporting evidence was detected. Missing wording is not proof of missing ability.";
      let evidence = (positive.length ? positive : termRows)
        .slice(0, 4)
        .map((item) => ({ lineId: item.id, quote: item.text }));
      if (personal || years || degree || !terms.length) {
        assessment = "confirm";
        explanation = personal
          ? "Confirm this eligibility requirement in your application profile; it is not inferred from CV keywords."
          : years
            ? "Review relevant years and dates manually. Overlapping roles and unrelated experience are not summed."
            : degree
              ? "Check the requested qualification and equivalent-experience clause against the education evidence."
              : "This requirement needs manual interpretation; no reliable rule was available.";
        if (!evidence.length && degree)
          evidence = body
            .filter((item) => item.section === "Education")
            .slice(0, 3)
            .map((item) => ({ lineId: item.id, quote: item.text }));
      }
      results.push({
        id: "R" + String(results.length + 1).padStart(3, "0"),
        text,
        priority: localPriority,
        terms,
        assessment,
        evidence,
        explanation,
      });
    }
  }
  return results;
}
const fixes: Record<string, [AtsIssue["severity"], string]> = {
  tables: [
    "high",
    "Move essential role, employer and date text out of tables in a separate readable copy. Keep the original unchanged.",
  ],
  columns: [
    "high",
    "Use a single-column copy if the text preview mixes sections or dates. Review the extracted order below.",
  ],
  textboxes: [
    "high",
    "Move essential facts from text boxes into ordinary body paragraphs in a separate copy.",
  ],
  "contact-region": [
    "high",
    "Put name, email and phone in the body, not only its header or footer.",
  ],
  images: [
    "medium",
    "Make every important fact selectable text. Images must not contain the only copy of a qualification.",
  ],
  changes: [
    "high",
    "Inspect hidden text and accept or reject tracked changes in a copy before exporting.",
  ],
  size: [
    "high",
    "Reduce embedded images and check the employer's actual upload limit.",
  ],
  text: [
    "high",
    "Inspect the text preview. For scans, use a text-based original or reviewed OCR transcription.",
  ],
  email: [
    "high",
    "Add a valid contact email in the body and check that extraction keeps it intact.",
  ],
  sections: [
    "medium",
    "Use clear headings such as Experience, Education, Skills and Projects.",
  ],
  length: [
    "low",
    "Review completeness and relevance; word count is a prompt, not a hiring rule.",
  ],
  characters: [
    "high",
    "Re-export from the editable source and check fonts/encoding where replacement characters appear.",
  ],
  "pdf-columns": [
    "high",
    "Check page and line references for interleaved columns; provide a single-column copy if necessary.",
  ],
  "pdf-order": [
    "high",
    "Compare the extracted sequence with the PDF. Re-export if employer, role and date lines are reordered.",
  ],
  "image-only": [
    "high",
    "This file has no usable text layer. Use an editable original or reviewed OCR; this check does not perform OCR.",
  ],
};
export function analyzeAts(
  parser: ParsedCv,
  jobText = "",
  verification?: ExportVerification,
  originalEvidence?: string,
): AtsAnalysis {
  const findings: AtsFinding[] = parser.findings.length
    ? parser.findings
    : resumeChecks(parser.text).checks.map((item) => ({
        id: item.id,
        label: item.label,
        status: item.status === "ok" ? ("pass" as const) : ("review" as const),
        detail: item.detail,
      }));
  const issues: AtsIssue[] = findings
    .filter((item) => item.status === "review")
    .map((item) => {
      const [severity, action] = fixes[item.id] || [
        "medium",
        "Review the referenced text against the source document.",
      ];
      const relevant = parser.lines.filter((line) =>
        item.id === "contact-region"
          ? line.region === "header" || line.region === "footer"
          : item.id === "sections"
            ? Boolean(sectionHeading(line.text))
            : item.id === "characters"
              ? /\uFFFD/.test(line.text)
              : false,
      );
      return {
        id: item.id,
        severity,
        label: item.label,
        detail: item.detail,
        locations:
          item.locations ||
          relevant
            .slice(0, 8)
            .map(
              (line) =>
                line.id +
                (line.page ? " · page " + line.page : "") +
                " · " +
                line.section,
            ),
        action,
      };
    });
  const requirements = jobRequirements(jobText, parser);
  if (originalEvidence !== undefined) {
    const originalSkills = new Set(cvSkillSignals(originalEvidence));
    for (const skill of cvSkillSignals(parser.text).filter(
      (skill) => !originalSkills.has(skill),
    )) {
      const sources = parser.lines.filter((line) =>
        resumeChecks(line.text, skill).keywords.some((item) => item.mentioned),
      );
      issues.push({
        id: "claim-skill-" + skill,
        severity: "high",
        label: "Added skill needs source confirmation",
        detail:
          skill +
          " appears in this version but was not positively detected in the original CV or confirmed additional facts.",
        locations: sources.slice(0, 4).map((line) => line.id),
        action:
          "Confirm supporting experience before using this claim, or remove the addition. A missing mention does not prove the claim is false.",
      });
    }
    const metrics = (value: string) =>
      [
        ...value.matchAll(
          /\b\d+(?:\.\d+)?\s*(?:%|years?\b|users?\b|customers?\b|revenue\b)/gi,
        ),
      ].map((item) => item[0].toLowerCase().replace(/\s+/g, ""));
    const before = new Set(metrics(originalEvidence));
    for (const metric of new Set(
      metrics(parser.text).filter((value) => !before.has(value)),
    ))
      issues.push({
        id: "claim-metric-" + metric,
        severity: "high",
        label: "Added metric needs source confirmation",
        detail:
          metric +
          " was not found in the original CV or confirmed additional facts.",
        locations: parser.lines
          .filter((line) => metrics(line.text).includes(metric))
          .slice(0, 4)
          .map((line) => line.id),
        action:
          "Verify the exact number and what it measures. Keep only metrics supported by your actual work.",
      });
  }
  for (const requirement of requirements.filter(
    (item) => item.assessment !== "evidence",
  ))
    issues.push({
      id: requirement.id,
      severity: requirement.priority === "required" ? "high" : "medium",
      label:
        requirement.priority === "required"
          ? "Required qualification needs review"
          : "Job requirement needs review",
      detail: requirement.text,
      locations: requirement.evidence.map((item) => item.lineId),
      action:
        requirement.assessment === "mention"
          ? "Connect the skill to a truthful project or role; do not invent experience."
          : requirement.assessment === "confirm"
            ? requirement.explanation
            : "If you have this experience, confirm supporting facts before adding wording. Otherwise keep the gap visible.",
    });
  if (verification?.state === "mismatch")
    issues.unshift({
      id: "export-integrity",
      severity: "high",
      label: "Exported content differs from reviewed wording",
      detail: verification.detail,
      locations: [],
      action:
        "Correct the saved CV source/export and rerun verification before using the file.",
    });
  const weight = { high: 0, medium: 1, low: 2 };
  return {
    version: ATS_VERSION,
    parser,
    requirements,
    verification,
    issues: issues.sort((a, b) => weight[a.severity] - weight[b.severity]),
  };
}
