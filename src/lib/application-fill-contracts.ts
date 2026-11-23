import { z } from "./zod";
export const companionId = "iljjpkhlfijljkfglkpnpmodadeohchi";
export function targetInfo(value: string) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      (u.port && u.port !== "443")
    )
      return null;
    let m;
    if (
      ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(u.hostname)
    ) {
      m = u.pathname.match(/^\/([a-z0-9_-]+)\/jobs\/(\d+)\/?$/i);
      return m
        ? {
            platform: "greenhouse" as const,
            identity: m[1].toLowerCase() + ":" + m[2],
            url: u.href,
          }
        : null;
    }
    if (["jobs.lever.co", "jobs.eu.lever.co"].includes(u.hostname)) {
      m = u.pathname.match(
        /^\/([a-z0-9_-]+)\/([a-f0-9-]{36})(?:\/(?:apply|thanks))?\/?$/i,
      );
      return m
        ? {
            platform: "lever" as const,
            identity:
              "lever:" +
              u.hostname +
              ":" +
              m[1].toLowerCase() +
              ":" +
              m[2].toLowerCase(),
            url: u.href,
          }
        : null;
    }
    if (u.hostname === "jobs.ashbyhq.com") {
      m = u.pathname.match(
        /^\/([a-z0-9_-]+)\/([a-f0-9-]{36})(?:\/application)?\/?$/i,
      );
      return m
        ? {
            platform: "ashby" as const,
            identity: "ashby:" + m[1].toLowerCase() + ":" + m[2].toLowerCase(),
            url: u.href,
          }
        : null;
    }
    return null;
  } catch {
    return null;
  }
}
export const fillTarget = (value: string) =>
  targetInfo(value)?.identity || null;
export const fieldSchema = z
  .object({
    id: z.string().min(1).max(100),
    label: z.string().trim().max(1000),
    name: z.string().max(200),
    kind: z.enum([
      "text",
      "email",
      "tel",
      "url",
      "number",
      "textarea",
      "select",
      "radio",
      "checkbox",
      "file",
      "combobox",
      "unsupported",
    ]),
    required: z.boolean(),
    empty: z.boolean(),
    options: z
      .array(
        z
          .object({ value: z.string().max(1000), label: z.string().max(1000) })
          .strict(),
      )
      .max(100)
      .default([]),
    accept: z.string().max(500).default(""),
  })
  .strict();
export const scanSchema = z
  .object({
    fields: z.array(fieldSchema).min(1).max(100),
    blockers: z.array(z.string().max(300)).max(20).default([]),
  })
  .strict()
  .superRefine((v, c) => {
    if (new Set(v.fields.map((f) => f.id)).size !== v.fields.length)
      c.addIssue({ code: "custom", message: "Duplicate field IDs" });
  });
export type FillField = z.infer<typeof fieldSchema>;
export type FillScan = z.infer<typeof scanSchema>;
export const startFillSchema = z
  .object({
    catalogId: z.string().regex(/^[a-f0-9]{64}$/),
    resumeAssetId: z.string().min(1).max(100),
    country: z.string().trim().min(2).max(80),
    consent: z.literal(true),
  })
  .strict();
export const reportSchema = z
  .object({
    scanHash: z.string().regex(/^[a-f0-9]{64}$/),
    revision: z.number().int().min(1),
    results: z
      .array(
        z
          .object({
            id: z.string().max(100),
            status: z.enum(["filled", "preserved", "needs_input", "failed"]),
            reason: z.string().max(300),
          })
          .strict(),
      )
      .max(100),
    blockers: z.array(z.string().max(300)).max(20),
    fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    uploadVerified: z.boolean().default(false),
    auditClean: z.boolean().default(false),
  })
  .strict();
export const questionLabel = (s: string) =>
  s
    .trim()
    .replace(/\s*\*\s*$/, " ")
    .trim();
export const normalChoice = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function exactOption(answer: string, options: FillField["options"]) {
  const found = options.filter(
    (o) => normalChoice(o.label) === normalChoice(answer) || o.value === answer,
  );
  return found.length === 1 ? found[0].value : null;
}
