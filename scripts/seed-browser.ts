import { writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { generateApplication } from "../src/lib/assistant";
import type { Fact } from "../src/lib/assistant-contracts";
async function main() {
  if (!process.env.DATABASE_URL?.includes("/jobcompass_browser_test"))
    throw new Error("Browser fixture database required");
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Job", "ProfileVersion", "ResumeAsset", "Profile", "Settings", "ApiRequestLedger" CASCADE',
  );
  const facts: Fact[] = [
    {
      id: randomUUID(),
      section: "experience",
      label: "Mobile project",
      text: "Built an Android application using Kotlin.",
      reviewed: true,
    },
    ...[
      ["first name", "Avery"],
      ["last name", "Example"],
      ["email", "avery@example.test"],
    ].map(([label, text]) => ({
      id: randomUUID(),
      section: "contact" as const,
      label,
      text,
      reviewed: true as const,
    })),
  ];
  await db.profileVersion.create({ data: { facts } });
  const job = await db.job.create({
    data: {
      title: "Android Developer",
      employer: "Example Studio",
      description:
        "Build thoughtful Android experiences with Kotlin. Experience with Terraform is useful.",
      location: "Kuala Lumpur",
      country: "my",
      remote: true,
      workArrangement: "remote",
      employmentType: "Full-time",
      salaryMin: 5000,
      salaryMax: 7000,
      salaryCurrency: "MYR",
      salaryPeriod: "MONTH",
      relatedFingerprint: randomUUID(),
      sources: {
        create: {
          providerId: randomUUID(),
          publisher: "Controlled fixture",
          applyLinks: [
            {
              url: "http://127.0.0.1:3000/fixtures/application",
              publisher: "Controlled local test",
              direct: true,
            },
          ],
        },
      },
    },
  });
  const second = await db.job.create({
    data: {
      title: "Project Coordinator",
      employer: "Other Example",
      location: "Singapore",
      country: "sg",
      relatedFingerprint: randomUUID(),
    },
  });
  const q = { factId: facts[0].id, quote: facts[0].text };
  const run = await generateApplication(job.id, randomUUID(), [], "en", {
    generate: async () => ({
      output: {
        resume: [q],
        coverLetter: [q],
        strengths: [
          {
            requirement: "Kotlin",
            evidence: { factId: facts[0].id, quote: "Kotlin" },
          },
        ],
        gaps: [
          {
            requirement: "Terraform",
            question: "Can you confirm any Terraform experience?",
          },
        ],
        answers: [],
      },
      inputTokens: 100,
      outputTokens: 120,
    }),
  });
  const app = await db.application.findUniqueOrThrow({
    where: { jobId: job.id },
  });
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/browser-seed.json",
    JSON.stringify({
      jobId: job.id,
      otherId: second.id,
      applicationId: app.id,
      generationId: run.id,
    }),
  );
  console.log("Seeded fictional local browser fixtures; no provider calls.");
}
main().finally(() => db.$disconnect());
