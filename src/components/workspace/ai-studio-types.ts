import type { ResumeChecks } from "@/lib/resume-checks";
import type {
  ReviewOutput,
  ValidatedReview,
} from "@/lib/resume-review-contracts";
export type Job = {
  id: string;
  title: string;
  employer: string;
  description: string;
  source: "catalog" | "workspace";
};
export type Run = {
  id: string;
  provider: string;
  model: string;
  state: string;
  error: string | null;
  report: (ReviewOutput & Partial<Pick<ValidatedReview, "validation">>) | null;
  checks: ResumeChecks;
  jobSnapshot: Job;
  resumeSnapshot: string;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
};
