"use client";
import { CheckCircle2, AlertCircle } from "lucide-react";
import type { AtsFinding } from "@/lib/original-cv-contracts";
import { resumeChecks } from "@/lib/resume-checks";
export function AtsReport({
  text,
  jobText = "",
  findings,
}: {
  text: string;
  jobText?: string;
  findings?: AtsFinding[];
}) {
  const checks = resumeChecks(text, jobText);
  const rows =
    findings ||
    checks.checks.map((c) => ({
      id: c.id,
      label: c.label,
      status: c.status === "ok" ? ("pass" as const) : ("review" as const),
      detail: c.detail,
    }));
  const risks = rows.filter((r) => r.status === "review");
  return (
    <section className="ats-report" aria-label="ATS readiness report">
      <div className="ats-report-heading">
        <div>
          <span className="studio-kicker">ATS READINESS</span>
          <h3>
            {risks.length
              ? `${risks.length} item${risks.length === 1 ? "" : "s"} to review`
              : "Checks complete"}
          </h3>
          <p>
            {rows.length - risks.length} of {rows.length} checks passed ·{" "}
            {checks.mentioned} of {checks.total} recognised job keywords
            mentioned
          </p>
        </div>
        <span className={risks.length ? "ats-state review" : "ats-state"}>
          {risks.length ? "Review needed" : "No issues detected"}
        </span>
      </div>
      {!findings && (
        <p className="ai-notice">
          Text-only check. Upload your DOCX to inspect tables, columns, images
          and headers.
        </p>
      )}
      <div className="ats-findings">
        {rows
          .toSorted(
            (a, b) => Number(a.status === "pass") - Number(b.status === "pass"),
          )
          .map((row) => (
            <article key={row.id}>
              {row.status === "pass" ? (
                <CheckCircle2 size={18} />
              ) : (
                <AlertCircle size={18} />
              )}
              <div>
                <strong>{row.label}</strong>
                <p>{row.detail}</p>
              </div>
              <span>{row.status === "pass" ? "Pass" : "Review"}</span>
            </article>
          ))}
      </div>
      {checks.total > 0 && (
        <div className="ats-keywords">
          <h4>Job keyword coverage</h4>
          <p>
            Mentions are not proof of experience. Add a missing term only when
            your experience supports it.
          </p>
          {checks.keywords.map((k) => (
            <span key={k.name} className={k.mentioned ? "present" : "missing"}>
              {k.mentioned ? "✓" : "○"} {k.name}
            </span>
          ))}
        </div>
      )}
      <p className="ai-fine-print">
        These are document and text checks, not an employer’s ATS result or a
        hiring score.{" "}
        <a
          href="https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse"
          target="_blank"
          rel="noopener noreferrer"
        >
          Parsing guidance
        </a>
      </p>
    </section>
  );
}
