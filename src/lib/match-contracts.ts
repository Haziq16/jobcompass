import { z } from "zod";
const words = z.array(z.string().trim().min(1).max(80)).max(24);
const matchPreferenceFields = z
  .object({
    titles: words.default([]),
    skills: words.default([]),
    locations: words.default([]),
    excluded: words.default([]),
    excludedCompanies: words.default([]),
    arrangement: z.enum(["any", "remote", "hybrid", "onsite"]).default("any"),
    arrangementStrict: z.boolean().default(false),
    locationStrict: z.boolean().default(false),
    roleStrict: z.boolean().default(false),
    seniority: z.enum(["any", "entry", "mid", "senior", "lead"]).default("any"),
    includeStretch: z.boolean().default(true),
    employmentTypes: z
      .array(z.enum(["full-time", "part-time", "contract", "internship"]))
      .max(4)
      .default([]),
    salaryMinimum: z
      .number()
      .int()
      .min(0)
      .max(100000000)
      .nullable()
      .default(null),
    salaryCurrency: z
      .enum(["USD", "SGD", "MYR", "GBP", "EUR", "CAD", "AUD", "INR"])
      .default("USD"),
    salaryPeriod: z.enum(["year", "month", "hour"]).default("year"),
    salaryStrict: z.boolean().default(false),
    allowUnknown: z.boolean().default(true),
    workAuthorization: words.default([]),
    needsSponsorship: z.boolean().default(false),
    excludeNoSponsorship: z.boolean().default(false),
    relocation: z.boolean().default(false),
    reviewed: z.literal(true),
  })
  .strict();
export const matchPreferenceDefaults = matchPreferenceFields.parse({
  reviewed: true,
});
export const matchPreferencesSchema = matchPreferenceFields.refine(
  (v) => v.titles.length > 0 || v.skills.length > 0,
  { message: "Add a target role or skill" },
);
export type MatchPreferences = z.infer<typeof matchPreferencesSchema>;
export const passReasons = [
  "Wrong role",
  "Too senior",
  "Too junior",
  "Location",
  "Salary",
  "Employer",
  "Not for me",
] as const;
export const matchActionSchema = z
  .object({
    requestId: z.string().uuid(),
    applicationConsent: z.string().max(5000).optional(),
    catalogId: z.string().regex(/^[a-f0-9]{64}$/),
    state: z.enum(["queued", "saved", "passed", "removed"]),
    reason: z.enum(passReasons).nullable().default(null),
    expectedRevision: z.number().int().min(0),
  })
  .strict();
