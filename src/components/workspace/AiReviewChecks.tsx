import type { ResumeChecks } from "@/lib/resume-checks";
export function Checks({ checks }: { checks: ResumeChecks }) {
  return (
    <div className="ai-text-checks">
      <h3>Text and keyword checks</h3>
      <p>
        These run without AI or an API key. They do not predict an employer’s
        ATS result.
      </p>
      <div className="ai-check-grid">
        {checks.checks.map((check) => (
          <div key={check.id}>
            <span
              className={
                check.status === "ok" ? "ai-check-ok" : "ai-check-review"
              }
            >
              {check.status === "ok" ? "Found" : "Review"}
            </span>
            <strong>{check.label}</strong>
            <p>{check.detail}</p>
          </div>
        ))}
      </div>
      {checks.total > 0 ? (
        <>
          <h4>
            {checks.mentioned} of {checks.total} recognised job keywords appear
            in this text
          </h4>
          <div className="ai-keywords">
            {checks.keywords.map((k) => (
              <span
                key={k.name}
                className={k.mentioned ? "present" : "missing"}
              >
                {k.mentioned ? "Mentioned" : "Not found"}: {k.name}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="muted">
          No supported vocabulary matches found. This checker covers a limited
          English keyword list; the AI review can examine the actual
          requirements.
        </p>
      )}
      <ul className="ai-check-notes">
        {checks.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
