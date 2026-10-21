import { hasTerm } from "./matching";

// Original, transparent keyword checks. This is neither an employer ATS emulator
// nor a qualification score. A term's presence does not prove proficiency.
const vocabulary: Record<string, string[]> = {
  JavaScript: ["javascript"],
  TypeScript: ["typescript"],
  Java: ["java"],
  Python: ["python"],
  "C++": ["c++"],
  "C#": ["c#"],
  Go: ["golang", "go programming"],
  Rust: ["rust"],
  Kotlin: ["kotlin"],
  Swift: ["swift"],
  SQL: ["sql"],
  React: ["react", "react.js", "reactjs"],
  "Next.js": ["next.js", "nextjs"],
  Vue: ["vue.js", "vuejs"],
  Angular: ["angular"],
  "Node.js": ["node.js", "nodejs"],
  HTML: ["html"],
  CSS: ["css"],
  "Tailwind CSS": ["tailwind"],
  Django: ["django"],
  Flask: ["flask"],
  Spring: ["spring boot", "spring framework"],
  PostgreSQL: ["postgresql", "postgres"],
  MySQL: ["mysql"],
  MongoDB: ["mongodb"],
  Redis: ["redis"],
  AWS: ["aws", "amazon web services"],
  Azure: ["azure"],
  "Google Cloud": ["google cloud", "gcp"],
  Docker: ["docker"],
  Kubernetes: ["kubernetes", "k8s"],
  Terraform: ["terraform"],
  Git: ["git"],
  "CI/CD": ["ci/cd", "continuous integration", "continuous delivery"],
  Linux: ["linux"],
  "REST APIs": ["rest api", "restful"],
  GraphQL: ["graphql"],
  "Machine learning": ["machine learning"],
  "Deep learning": ["deep learning"],
  PyTorch: ["pytorch"],
  TensorFlow: ["tensorflow"],
  NLP: ["natural language processing", "nlp"],
  "Data analysis": ["data analysis", "data analytics"],
  "Power BI": ["power bi"],
  Tableau: ["tableau"],
  Excel: ["excel"],
  Statistics: ["statistics", "statistical"],
  Figma: ["figma"],
  "UX research": ["ux research", "user research"],
  "UI design": ["ui design", "user interface design"],
  "Usability testing": ["usability testing"],
  Prototyping: ["prototyping"],
  Accessibility: ["accessibility", "wcag"],
  "Product management": ["product management"],
  "Project management": ["project management"],
  Agile: ["agile"],
  Scrum: ["scrum"],
  Jira: ["jira"],
  "Stakeholder management": ["stakeholder management"],
  "Customer success": ["customer success"],
  "Account management": ["account management"],
  Salesforce: ["salesforce"],
  HubSpot: ["hubspot"],
  Sales: ["sales"],
  CRM: ["crm"],
  SEO: ["seo", "search engine optimization", "search engine optimisation"],
  "Content marketing": ["content marketing"],
  Copywriting: ["copywriting"],
  "Google Analytics": ["google analytics", "ga4"],
  "Social media": ["social media"],
  "Financial modelling": ["financial modeling", "financial modelling"],
  Accounting: ["accounting"],
  Audit: ["audit", "auditing"],
  IFRS: ["ifrs"],
  GAAP: ["gaap"],
  SAP: ["sap"],
  "Supply chain": ["supply chain"],
  Logistics: ["logistics"],
  Procurement: ["procurement"],
  "Quality assurance": ["quality assurance"],
  Lean: ["lean manufacturing"],
  "Six Sigma": ["six sigma"],
  Recruitment: ["recruitment", "recruiting"],
  HRIS: ["hris"],
  Payroll: ["payroll"],
  "Employment law": ["employment law"],
  Training: ["training"],
  "Patient care": ["patient care"],
  "Clinical research": ["clinical research"],
  Nursing: ["nursing"],
  "GCP compliance": ["good clinical practice"],
  Leadership: ["leadership"],
  Communication: ["communication"],
  Negotiation: ["negotiation"],
  "Problem solving": ["problem solving", "problem-solving"],
};
export function resumeChecks(resume: string, jobText = "") {
  const lines = resume
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const words = resume.trim().split(/\s+/).filter(Boolean).length;
  const sectionPatterns = {
    Experience:
      /^(?:work |professional |employment )?(?:experience|history)\s*:?$|^employment\s*:?$/i,
    Education: /^(?:education|academic background|qualifications)\s*:?$/i,
    Skills: /^(?:(?:technical|core|key) )?(?:skills|competencies)\s*:?$/i,
    Projects: /^(?:(?:personal|selected|key) )?projects\s*:?$/i,
    Certifications: /^(?:certifications?|licen[cs]es?)\s*:?$/i,
  };
  const headings = Object.entries(sectionPatterns)
    .filter(([, regex]) => lines.some((l) => regex.test(l)))
    .map(([name]) => name);
  const checks = [
    {
      id: "text",
      label: "Extractable text",
      status: words >= 80 ? "ok" : "review",
      detail: `${words.toLocaleString()} words found. ${words < 80 ? "Check for missing content or image-only pages." : "Review the text preview for missing or reordered content."}`,
    },
    {
      id: "email",
      label: "Contact email",
      status: /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(resume) ? "ok" : "review",
      detail:
        "Checks for an email-shaped string, not ownership or deliverability.",
    },
    {
      id: "sections",
      label: "Recognisable headings",
      status:
        headings.includes("Experience") &&
        headings.includes("Education") &&
        headings.includes("Skills")
          ? "ok"
          : "review",
      detail: headings.length
        ? `Detected: ${headings.join(", ")}. Other headings or languages may need manual review.`
        : "No standard English section headings found. Review the parser text and headings.",
    },
    {
      id: "length",
      label: "Text length",
      status: words >= 150 && words <= 1600 ? "ok" : "review",
      detail:
        "Length is a review prompt, not a hiring rule. Text alone cannot determine page count.",
    },
    {
      id: "characters",
      label: "Text encoding",
      status: /\uFFFD/.test(resume) ? "review" : "ok",
      detail: /\uFFFD/.test(resume)
        ? "Replacement characters were found. Check the source document's text extraction."
        : "No replacement-character markers found. Visual layout and reading order still need review.",
    },
  ];
  const keywords = Object.entries(vocabulary)
    .filter(([, aliases]) => aliases.some((a) => hasTerm(jobText, a)))
    .map(([name, aliases]) => ({
      name,
      mentioned: aliases.some((a) => hasTerm(resume, a)),
      jobTerms: aliases.filter((a) => hasTerm(jobText, a)),
    }));
  return {
    words,
    headings,
    checks,
    keywords,
    mentioned: keywords.filter((k) => k.mentioned).length,
    total: keywords.length,
    notes: [
      "Keyword presence is not proof of ability; missing words do not prove missing skills.",
      "These English-focused heuristics are not an employer's ATS score or a prediction of interviews.",
      "Plain text cannot reliably assess columns, tables, graphics, page count or an employer's parser.",
    ],
  };
}
export type ResumeChecks = ReturnType<typeof resumeChecks>;
