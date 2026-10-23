type Report = {
  version?: number;
  filled?: number;
  preserved?: number;
  requiredMissing?: number;
  uploadVerified?: boolean;
  blockers?: string[];
  results?: {
    id: string;
    label?: string;
    status: string;
    reason: string;
    required?: boolean;
  }[];
};
export function applicationProgress(value: unknown) {
  const report = value as Report | null;
  if (!report || !Array.isArray(report.results)) return null;
  const blockers = [...new Set(report.blockers || [])];
  const missing = report.results
    .filter(
      (r) =>
        ["needs_input", "failed"].includes(r.status) && r.required !== false,
    )
    .map((r) => ({
      question: r.label || r.id,
      reason: r.reason,
      action:
        /consent|privacy|agree|gender|ethnic|sexual|transgender|disability|veteran/i.test(
          r.label || "",
        )
          ? "Choose this yourself on the employer form."
          : "Review and save a truthful answer in your answer inbox.",
    }));
  return {
    filled: report.filled || 0,
    preserved: report.preserved || 0,
    requiredMissing: report.requiredMissing || 0,
    uploadVerified: report.uploadVerified === true,
    legacy: report.version !== 2,
    blockers,
    missing,
    needsHumanVerification: blockers.some((b) =>
      /CAPTCHA|verification|sign.in/i.test(b),
    ),
  };
}

export function applicationTaskLabel(state: string) {
  return (
    (
      {
        queued: "Waiting for worker",
        leased: "Processing employer form",
        needs_input: "Needs your action",
        filled: "Form prepared; not submitted",
        submitting: "Submission in progress",
        confirmed: "Application confirmed",
        uncertain: "Outcome uncertain; do not retry",
        cancelled: "Processing stopped",
        failed: "Processing failed",
      } as Record<string, string>
    )[state] || state.replaceAll("_", " ")
  );
}
