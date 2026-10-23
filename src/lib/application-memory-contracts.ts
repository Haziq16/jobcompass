import { z } from "zod";
const text = (max = 300) => z.string().trim().max(max);
const link = text(500).refine((v) => {
  if (!v) return true;
  try {
    const url = new URL(v);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}, "Use a valid http or https URL");
function validDate(v: string) {
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(v)) return false;
  const [year, month = 1, day = 1] = v.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1900 &&
    year <= 2200 &&
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}
const date = text(10).refine(
  (v) => !v || v === "Present" || validDate(v),
  "Use a valid YYYY, YYYY-MM or YYYY-MM-DD",
);
const expiryDate = text(10).refine(
  (v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && validDate(v)),
  "Use a valid YYYY-MM-DD",
);
export const candidateSections = [
  "contact",
  "experience",
  "education",
  "projects",
  "skills",
  "eligibility",
  "preferences",
] as const;
export type CandidateSection = (typeof candidateSections)[number];
export const sectionLabels: Record<CandidateSection, string> = {
  contact: "Contact",
  experience: "Experience",
  education: "Education",
  projects: "Projects",
  skills: "Skills",
  eligibility: "Work eligibility",
  preferences: "Availability & salary",
};
export const candidateValuesSchema = z
  .object({
    contact: z
      .object({
        name: text(),
        email: text().refine(
          (v) => !v || z.email().safeParse(v).success,
          "Check your email",
        ),
        phone: text(80),
        location: text(),
        linkedin: link,
        portfolio: link,
      })
      .strict(),
    experience: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            employer: text(),
            title: text(),
            start: date,
            end: date,
            summary: text(4000),
          })
          .strict(),
      )
      .max(20),
    education: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            institution: text(),
            qualification: text(),
            start: date,
            end: date,
            details: text(3000),
          })
          .strict(),
      )
      .max(15),
    projects: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: text(),
            url: link,
            summary: text(4000),
          })
          .strict(),
      )
      .max(20),
    skills: z.array(text(80).min(1)).max(80),
    eligibility: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            country: text(80).min(1),
            status: z.enum([
              "unknown",
              "citizen",
              "permanent_resident",
              "work_visa",
              "not_authorized",
            ]),
            needsSponsorship: z.enum(["unknown", "yes", "no"]),
            details: text(2000),
            expiresOn: expiryDate,
          })
          .strict(),
      )
      .max(30),
    preferences: z
      .object({
        salaryAnswer: text(1000),
        salaryCountry: text(80),
        availability: text(1000),
        noticePeriod: text(500),
        relocation: z.enum(["unknown", "yes", "no"]),
      })
      .strict(),
    nothingToDeclare: z
      .array(z.enum(["experience", "education", "projects", "skills"]))
      .max(4),
    cvSource: z
      .object({
        assetId: z.string().max(100),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const section of [
      "experience",
      "education",
      "projects",
      "eligibility",
    ] as const) {
      const ids = v[section].map((r) => r.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          message: "Entry IDs must be unique",
          path: [section],
        });
    }
  });
export type CandidateValues = z.infer<typeof candidateValuesSchema>;
export const emptyCandidate: CandidateValues = {
  contact: {
    name: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    portfolio: "",
  },
  experience: [],
  education: [],
  projects: [],
  skills: [],
  eligibility: [],
  preferences: {
    salaryAnswer: "",
    salaryCountry: "",
    availability: "",
    noticePeriod: "",
    relocation: "unknown",
  },
  nothingToDeclare: [],
  cvSource: null,
};
export const candidateSaveSchema = z
  .object({
    values: candidateValuesSchema,
    expectedRevision: z.number().int().min(0),
    confirmSections: z.array(z.enum(candidateSections)).max(7),
  })
  .strict();
export const answerCategories = [
  "contact",
  "experience",
  "education",
  "projects",
  "skills",
  "authorization",
  "sponsorship",
  "salary",
  "availability",
  "relocation",
  "motivation",
  "personal",
  "custom",
] as const;
export type AnswerCategory = (typeof answerCategories)[number];
export const questionContextSchema = z
  .object({
    country: text(80).default(""),
    company: text(200).default(""),
    catalogId: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .default(null),
  })
  .strict();
export const questionSchema = z
  .object({
    question: text(1000).min(3),
    context: questionContextSchema,
    createMissing: z.boolean().default(true),
  })
  .strict();
export const answerSaveSchema = z
  .object({
    id: z.string().max(100).optional(),
    expectedRevision: z.number().int().min(0),
    question: text(1000).min(3),
    aliases: z.array(text(1000).min(3)).max(12).default([]),
    category: z.enum(answerCategories),
    answer: text(5000).min(1),
    context: questionContextSchema,
    reusable: z.boolean(),
    expiresAt: z.iso.datetime().nullable(),
    reviewed: z.literal(true),
    questionId: z.string().max(100).nullable().default(null),
  })
  .strict();
export type AnswerInput = z.infer<typeof answerSaveSchema>;
export function normalizeQuestion(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
const countries: Record<string, string> = {
  us: "united states",
  usa: "united states",
  "u s": "united states",
  "united states of america": "united states",
  uk: "united kingdom",
  "u k": "united kingdom",
  gb: "united kingdom",
  sg: "singapore",
  my: "malaysia",
  au: "australia",
  ca: "canada",
  in: "india",
  de: "germany",
  fr: "france",
};
export const normalizeCountry = (s: string) =>
  countries[normalizeQuestion(s)] || normalizeQuestion(s);
export const normalizeCompany = normalizeQuestion;
const known: Record<string, { category: AnswerCategory; phrases: string[] }> = {
  "contact.name": {
    category: "contact",
    phrases: [
      "full name",
      "what is your full name",
      "your full name",
      "legal name",
    ],
  },
  "contact.email": {
    category: "contact",
    phrases: ["email", "email address", "what is your email address"],
  },
  "contact.phone": {
    category: "contact",
    phrases: ["phone number", "telephone number", "what is your phone number"],
  },
  "availability.start": {
    category: "availability",
    phrases: [
      "when can you start",
      "when are you available to start",
      "earliest start date",
      "what is your earliest start date",
    ],
  },
  "availability.notice": {
    category: "availability",
    phrases: [
      "what is your notice period",
      "notice period",
      "how long is your notice period",
    ],
  },
  "salary.expected": {
    category: "salary",
    phrases: [
      "what are your salary expectations",
      "expected salary",
      "salary expectations",
      "what is your expected salary",
    ],
  },
  "relocation.willing": {
    category: "relocation",
    phrases: ["are you willing to relocate", "are you open to relocation"],
  },
  "motivation.company": {
    category: "motivation",
    phrases: [
      "why do you want to work here",
      "why are you interested in this company",
      "why do you want to join our company",
    ],
  },
};
export function classifyQuestion(question: string) {
  const n = normalizeQuestion(question);
  if (mentionedCountries(question).length > 1)
    return { key: "exact:" + n, category: "custom" as const };
  for (const [key, v] of Object.entries(known)) {
    if (v.phrases.includes(n)) return { key, category: v.category };
  }
  if (!/\b(not|without|never|unable|dont|lack)\b/.test(n)) {
    if (
      /\b(sponsorship|sponsor)\b/.test(n) &&
      /^(?:do you|will you|would you|will the company|does the company)\b/.test(
        n,
      ) &&
      /\b(require|need)\b/.test(n)
    )
      return { key: "sponsorship.required", category: "sponsorship" as const };
    if (
      !/\b(ever|previously|future|will|were|and|or)\b/.test(n) &&
      /^(?:are you|do you have)\b/.test(n) &&
      /\b(authorized|authorised|authorization|authorisation|right)\b/.test(n) &&
      /\bwork\b/.test(n)
    )
      return { key: "authorization.work", category: "authorization" as const };
  }
  return { key: "exact:" + n, category: "custom" as const };
}
function mentionedCountries(question: string) {
  const n = normalizeQuestion(question);
  const options = [
    "united states of america",
    "united states",
    "united kingdom",
    "singapore",
    "malaysia",
    "australia",
    "canada",
    "germany",
    "france",
    "india",
  ];
  const found = options
    .filter((c) => (" " + n + " ").includes(" " + c + " "))
    .map(normalizeCountry);
  for (const abbreviation of question.match(/\b(?:USA|UK|US)\b/g) || [])
    found.push(normalizeCountry(abbreviation));
  return [...new Set(found)];
}
export function mentionedCountry(question: string) {
  const found = mentionedCountries(question);
  return found.length === 1 ? found[0] : null;
}
export const countryCategories = new Set<AnswerCategory>([
  "authorization",
  "sponsorship",
  "salary",
]);
export const sourceSections: Partial<Record<AnswerCategory, CandidateSection>> =
  {
    contact: "contact",
    experience: "experience",
    education: "education",
    projects: "projects",
    skills: "skills",
    authorization: "eligibility",
    sponsorship: "eligibility",
    salary: "preferences",
    availability: "preferences",
    relocation: "preferences",
  };
