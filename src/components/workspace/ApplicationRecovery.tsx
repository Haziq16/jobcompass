import type { applicationProgress } from "@/lib/application-progress";
export default function ApplicationRecovery({
  progress,
  state = "needs_input",
}: {
  catalogId: string;
  progress: NonNullable<ReturnType<typeof applicationProgress>>;
  state?: string;
}) {
  if (["confirmed", "uncertain", "submitting"].includes(state))
    return (
      <section className="application-recovery">
        <p>
          {state === "confirmed"
            ? "Application confirmed. No further filling or submission is needed."
            : state === "submitting"
              ? "Submission is in progress. Wait for an employer receipt; do not submit again."
              : "The employer outcome is uncertain. Check the existing application and use the outcome controls; do not start a fresh form or submit again."}
        </p>
      </section>
    );
  return (
    <section
      className="application-recovery"
      aria-label="Application progress and next steps"
    >
      <p className="application-progress-summary">
        {progress.legacy
          ? "Older report: counts reflect the final scan; earlier filling was not tracked."
          : `${progress.filled} fields filled by JobCompass; ${progress.preserved} existing values preserved.`}{" "}
        {progress.requiredMissing} required fields need attention. CV upload:{" "}
        {progress.uploadVerified ? "verified" : "not verified"}.
      </p>
      {progress.blockers.length > 0 && (
        <ul>
          {progress.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {progress.missing.length > 0 && (
        <details>
          <summary>Review {progress.missing.length} unresolved fields</summary>
          <dl>
            {progress.missing.map((m, i) => (
              <div key={i}>
                <dt>{m.question}</dt>
                <dd>
                  {m.reason}
                  <br />
                  {m.action}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <p>
        {progress.needsHumanVerification
          ? "Continue in your own employer tab using the companion. Human verification must be completed there."
          : progress.requiredMissing
            ? "Save missing answers, then return to this application to authorize a fresh attempt."
            : progress.blockers.length
              ? "Review the form-specific blocker in your employer tab. Unsupported controls may need manual completion."
              : "The form is prepared. Review the employer tab and the submission setting before continuing."}{" "}
        Background browser tabs close when a task pauses; the companion refills
        a fresh form from confirmed facts rather than restoring that tab.
      </p>
    </section>
  );
}
