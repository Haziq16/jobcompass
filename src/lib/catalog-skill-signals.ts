import { resumeSkillTerms } from "./resume-checks";

// Bump when the term list or mention semantics change, then rebuild public keys.
export const CATALOG_SKILL_VERSION = 1;
const terms = [
  ...new Set(
    [
      ...resumeSkillTerms,
      "Vue",
      "GCP",
      ".NET",
      "ASP.NET",
      "Golang",
      "C",
      "PHP",
      "Ruby",
      "Scala",
      "R",
      "Cassandra",
      "Elasticsearch",
      "Jenkins",
      "GitHub",
      "GitLab",
      "Jest",
      "Cypress",
      "Playwright",
      "NumPy",
      "Pandas",
      "Spark",
      "Hadoop",
      "Snowflake",
      "Databricks",
      "BigQuery",
      "FastAPI",
      "Express",
      "NestJS",
      "Svelte",
      "SolidWorks",
      "AutoCAD",
      "senior",
      "staff",
      "principal",
      "director",
      "intern",
      "internship",
      "unpaid",
      "commission",
      "commission only",
      "contract",
      "temporary",
      "freelance",
      "sponsorship",
      "visa",
      "remote",
      "on-site",
      "onsite",
      "recruiter",
      "agency",
      "consultant",
      "security clearance",
    ].map((t) => t.toLowerCase()),
  ),
];
const matchers = terms.map((term) => ({
  term,
  regex: new RegExp(
    `(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`,
    "i",
  ),
}));
export const cachedCatalogSkills = new Set(terms);
/** Exact mention checks matching the existing explanation rules; not AI inference. */
export function catalogSkillKeys(text: string) {
  return matchers.filter((m) => m.regex.test(text)).map((m) => m.term);
}
