"use client";
import { useState } from "react";
import {
  CheckCircle2,
  Download,
  Trash2,
  ArrowUpRight,
  ClipboardCheck,
} from "lucide-react";
import type { Run } from "./ai-studio-types";
import { Checks } from "./AiReviewChecks";

const labels = {
  supported: "Matching experience",
  transferable: "Related experience",
  not_evidenced: "Not shown in your CV",
  unclear: "Needs clarification",
};
const guidance = {
  supported:
    "Keep this example prominent and preserve the employer, dates and outcome that give it context.",
  transferable:
    "Explain how this experience connects to the role. Keep the distinction between related and direct experience clear.",
  not_evidenced:
    "If you have this experience, add a specific, truthful example. Otherwise, keep this as a gap to consider before applying.",
  unclear:
    "Make the relevant scope, dates or level of responsibility explicit, if your experience supports it.",
};
function outlineText(run: Run) {
  return [
    "TAILORED EVIDENCE OUTLINE — REVIEW BEFORE USE",
    `Target: ${run.jobSnapshot.title} at ${run.jobSnapshot.employer}`,
    "Selected original excerpts, not a complete or rewritten résumé. Verify chronology and context against your full original.",
    ...(run.report?.outline || []).flatMap((s) => [
      "",
      s.heading.toUpperCase(),
      ...s.excerpts.map((e) => e.quote),
    ]),
  ].join("\n");
}
function saveText(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
export function ReviewResult({
  run,
  onDelete,
  onNew,
  onEdit,
  errorMessage,
}: {
  run: Run;
  onDelete: () => Promise<void>;
  onNew: () => void;
  onEdit: () => void;
  errorMessage: (code: string) => string;
}) {
  const [tab, setTab] = useState("overview");
  const [filter, setFilter] = useState("all");
  const requirements = run.report?.requirements || [];
  const strengths = requirements.filter((r) => r.assessment === "supported");
  const related = requirements.filter((r) => r.assessment === "transferable");
  const attention = requirements.filter((r) =>
    ["not_evidenced", "unclear"].includes(r.assessment),
  );
  const actions = requirements
    .filter((r) => r.assessment !== "supported")
    .toSorted(
      (a, b) =>
        ({ required: 0, preferred: 2, unspecified: 1 })[a.priority] -
        { required: 0, preferred: 2, unspecified: 1 }[b.priority],
    );
  function exportPlan() {
    saveText(
      [
        `APPLICATION REVIEW: ${run.jobSnapshot.title} at ${run.jobSnapshot.employer}`,
        "AI interpretation; not an ATS score or hiring prediction.",
        ...(run.report?.validation?.omittedEvidence
          ? [
              `Validation notice: ${run.report.validation.omittedEvidence} unverifiable CV excerpts were removed; ${run.report.validation.requirementsNeedingReview} requirements need manual review.`,
            ]
          : []),
        ...requirements.flatMap((r) => [
          "",
          `${labels[r.assessment]}${r.priority === "required" ? " · Required" : ""}`,
          `Job: ${r.jobQuote}`,
          ...r.evidence.map((e) => `CV: ${e.quote}`),
          `Action: ${guidance[r.assessment]}`,
          ...(r.question ? [`Clarify: ${r.question}`] : []),
        ]),
      ].join("\n"),
      "jobcompass-application-review.txt",
    );
  }
  return (
    <section className="ai-report" aria-labelledby="ai-report-title">
      <div className="ai-section-top">
        <div>
          <p className="eyebrow">YOUR APPLICATION REVIEW</p>
          <h2 id="ai-report-title">{run.jobSnapshot.title}</h2>
          <p>{run.jobSnapshot.employer}</p>
        </div>
        <button
          disabled={run.state === "pending"}
          onClick={() => void onDelete()}
          aria-label="Delete this AI review"
        >
          <Trash2 size={16} />
        </button>
      </div>
      {run.state !== "succeeded" ? (
        <div role="status" className="ai-run-state">
          <h3>
            {run.state === "pending"
              ? "Your review is still running"
              : run.state === "uncertain"
                ? "We couldn’t confirm a result"
                : "Your review wasn’t completed"}
          </h3>
          <p>
            {run.error
              ? errorMessage(run.error)
              : "Open or reload this saved review to check the result. This does not send another paid request."}
          </p>
          {run.state !== "pending" && (
            <button onClick={onNew}>
              Prepare a new request <ArrowUpRight size={15} />
            </button>
          )}
        </div>
      ) : (
        <>
          {Boolean(run.report?.validation?.omittedEvidence) && (
            <div className="ai-validation-warning" role="status">
              <strong>Some evidence needs your review</strong>
              <p>
                {run.report!.validation!.omittedEvidence} unverifiable CV{" "}
                {run.report!.validation!.omittedEvidence === 1
                  ? "excerpt was"
                  : "excerpts were"}{" "}
                removed. {run.report!.validation!.requirementsNeedingReview}{" "}
                {run.report!.validation!.requirementsNeedingReview === 1
                  ? "requirement is"
                  : "requirements are"}{" "}
                marked “Needs clarification”. The remaining quotes were verified
                against your original text.
              </p>
            </div>
          )}
          <div
            className="ai-report-tabs"
            role="group"
            aria-label="Review sections"
          >
            {[
              ["overview", "Overview & action plan"],
              ["requirements", "Requirements & evidence"],
              ["outline", "Tailored evidence outline"],
              ["checks", "Text checks"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "overview" && (
            <>
              <div className="ai-summary-grid" aria-label="Requirement summary">
                <div>
                  <strong>{strengths.length}</strong>
                  <span>Matching experience</span>
                </div>
                <div>
                  <strong>{related.length}</strong>
                  <span>Related experience</span>
                </div>
                <div>
                  <strong>{attention.length}</strong>
                  <span>Need attention</span>
                </div>
              </div>
              <p className="ai-summary-caption">
                Across {requirements.length} reviewed requirements. These are
                evidence counts, not an ATS score or a hiring prediction.
              </p>
              <div className="ai-section-top">
                <div>
                  <h3>What to improve before applying</h3>
                  <p>
                    Explicit requirements come first. Use these as editing
                    prompts, not new claims to paste into your CV.
                  </p>
                </div>
                <button
                  onClick={exportPlan}
                  aria-label="Download application review"
                >
                  <Download size={16} />
                </button>
              </div>
              {actions.length ? (
                <ol className="ai-action-list">
                  {actions.map((r, i) => (
                    <li key={r.jobQuote}>
                      <span className="ai-action-number">{i + 1}</span>
                      <div>
                        <span
                          className={`ai-action-label assessment-${r.assessment}`}
                        >
                          {labels[r.assessment]}
                          {r.priority === "required"
                            ? " · Required"
                            : r.priority === "preferred"
                              ? " · Preferred"
                              : ""}
                        </span>
                        <h4>“{r.jobQuote}”</h4>
                        <p>{guidance[r.assessment]}</p>
                        {r.question && (
                          <p className="ai-question">
                            <strong>Ask yourself:</strong> {r.question}
                          </p>
                        )}
                        {r.evidence.length > 0 && (
                          <details>
                            <summary>See the current CV evidence</summary>
                            {r.evidence.map((e) => (
                              <blockquote key={e.blockId + e.quote}>
                                <p>{e.quote}</p>
                                <cite>CV excerpt {e.blockId}</cite>
                              </blockquote>
                            ))}
                          </details>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="ai-empty-action">
                  <ClipboardCheck size={24} />
                  <p>
                    The reviewed requirements have matching evidence. Check its
                    relevance and context before using the outline.
                  </p>
                </div>
              )}
              <h3>Experience to lead with</h3>
              {strengths.length ? (
                strengths.slice(0, 4).map((r) => (
                  <article className="ai-strength" key={r.jobQuote}>
                    <h4>{r.jobQuote}</h4>
                    {r.evidence.map((e) => (
                      <blockquote key={e.blockId + e.quote}>
                        <p>{e.quote}</p>
                        <cite>Original CV · {e.blockId}</cite>
                      </blockquote>
                    ))}
                  </article>
                ))
              ) : (
                <p>
                  No direct matches were identified in this review. Related
                  experience is available in the evidence tab; it does not
                  confirm that you meet a requirement.
                </p>
              )}
            </>
          )}
          {tab === "requirements" && (
            <>
              <label className="ai-filter">
                Show requirements
                <select
                  aria-label="Show requirements"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">
                    All requirements ({requirements.length})
                  </option>
                  <option value="attention">
                    Need attention ({attention.length})
                  </option>
                  <option value="supported">
                    Matching experience ({strengths.length})
                  </option>
                  <option value="transferable">
                    Related experience ({related.length})
                  </option>
                </select>
              </label>
              <div className="ai-requirements">
                {requirements
                  .filter(
                    (r) =>
                      filter === "all" ||
                      (filter === "attention"
                        ? ["not_evidenced", "unclear"].includes(r.assessment)
                        : r.assessment === filter),
                  )
                  .map((r) => (
                    <article key={r.jobQuote}>
                      <div className="ai-requirement-meta">
                        <span>
                          {r.priority === "unspecified"
                            ? "Priority not explicit"
                            : r.priority}
                        </span>
                        <span className={`assessment-${r.assessment}`}>
                          {labels[r.assessment]}
                        </span>
                      </div>
                      <h3>“{r.jobQuote}”</h3>
                      <small>Quoted from the job posting</small>
                      {r.evidence.length ? (
                        r.evidence.map((e) => (
                          <blockquote key={e.blockId + e.quote}>
                            <p>{e.quote}</p>
                            <cite>CV excerpt {e.blockId}</cite>
                          </blockquote>
                        ))
                      ) : (
                        <p>
                          No supporting CV excerpt was supplied. That does not
                          prove you lack the qualification.
                        </p>
                      )}
                      {r.question && (
                        <p className="ai-question">
                          <strong>Clarify:</strong> {r.question}
                        </p>
                      )}
                    </article>
                  ))}
              </div>
              {filter !== "all" &&
                !requirements.some((r) =>
                  filter === "attention"
                    ? ["not_evidenced", "unclear"].includes(r.assessment)
                    : r.assessment === filter,
                ) && (
                  <p className="ai-empty-action">
                    No requirements in this category.
                  </p>
                )}
            </>
          )}
          {tab === "outline" && (
            <div className="ai-outline">
              <h3>A stronger order for your existing evidence</h3>
              <p>
                Selected original excerpts, ready for your editing process. This
                is not a complete or rewritten CV. Preserve roles, dates and
                context; don’t add qualifications you don’t have.
              </p>
              <button
                onClick={() =>
                  saveText(outlineText(run), "jobcompass-evidence-outline.txt")
                }
              >
                <Download size={16} />
                Download text outline
              </button>
              {run.report?.outline.map((s) => (
                <section className="ai-outline-section" key={s.heading}>
                  <h4>{s.heading}</h4>
                  {s.excerpts.map((e) => (
                    <p key={e.blockId + e.quote}>{e.quote}</p>
                  ))}
                </section>
              ))}
              <details>
                <summary>Compare with the submitted résumé</summary>
                <pre>{run.resumeSnapshot}</pre>
              </details>
            </div>
          )}
          {tab === "checks" && <Checks checks={run.checks} />}
          <button onClick={onEdit}>
            Improve this CV <ArrowUpRight size={15} />
          </button>
          <p className="ai-report-note">
            <CheckCircle2 size={16} />
            Quotes were checked against the submitted text. Relevance and
            interpretation are AI judgments and still need your review.
          </p>
        </>
      )}
      <details className="ai-usage">
        <summary>Model & usage details</summary>
        <p>
          {run.provider} / {run.model} ·{" "}
          {new Date(run.createdAt).toLocaleString()}
        </p>
        <p>
          {run.inputTokens !== null || run.outputTokens !== null
            ? `Provider-reported usage: ${run.inputTokens ?? "unknown"} input / ${run.outputTokens ?? "unknown"} output tokens.`
            : "Provider token usage was not available."}{" "}
          Costs are set by your provider. No shared JobCompass AI credits are
          used.
        </p>
      </details>
    </section>
  );
}
