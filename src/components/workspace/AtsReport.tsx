"use client";
import { useEffect, useId, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  FileSearch,
} from "lucide-react";
import type { AtsFinding } from "@/lib/original-cv-contracts";
import {
  analyzeAts,
  parseCvText,
  type AtsAnalysis,
  type ParsedCv,
} from "@/lib/ats-analysis";
import { api } from "./client";
export function AtsReport({
  text,
  jobText = "",
  findings,
  parser,
  sourceAssetId,
  draftId,
  revision,
}: {
  text: string;
  jobText?: string;
  findings?: AtsFinding[];
  parser?: ParsedCv | null;
  sourceAssetId?: string;
  draftId?: string;
  revision?: number;
}) {
  const prefix = useId();
  const [tab, setTab] = useState("findings"),
    [line, setLine] = useState(""),
    [reload, setReload] = useState(0);
  const [remote, setRemote] = useState<{
    key: string;
    data?: AtsAnalysis;
    error?: string;
  } | null>(null);
  const key = JSON.stringify([
    sourceAssetId,
    draftId,
    revision,
    text,
    jobText,
    reload,
  ]);
  const hasFile = Boolean(sourceAssetId || (draftId && revision));
  useEffect(() => {
    if (!hasFile) return;
    let current = true;
    const input = draftId
      ? { source: "draft", id: draftId, revision, jobText }
      : { source: "asset", id: sourceAssetId, jobText };
    api<AtsAnalysis>("ai/ats", "POST", input)
      .then((data) => {
        if (current) setRemote({ key, data });
      })
      .catch(() => {
        if (current)
          setRemote({
            key,
            error:
              "The saved file could not be inspected. Check the saved revision or reload the report. Text-only checks remain available.",
          });
      });
    return () => {
      current = false;
    };
  }, [key, hasFile, draftId, sourceAssetId, revision, jobText]);
  useEffect(() => {
    if (tab === "parser" && line) {
      const target = document.getElementById(prefix + "-" + line);
      target?.scrollIntoView({ block: "center", behavior: "instant" });
      target?.focus({ preventScroll: true });
    }
  }, [tab, line, prefix]);
  const fallback =
    parser &&
    parser.text.replace(/\s+/g, " ").trim() === text.replace(/\s+/g, " ").trim()
      ? parser
      : parseCvText(text);
  const report =
    remote?.key === key && remote.data
      ? remote.data
      : analyzeAts(
          {
            ...fallback,
            findings: fallback.findings.length
              ? fallback.findings
              : findings || [],
          },
          jobText,
        );
  const loading = hasFile && remote?.key !== key;
  const error = remote?.key === key ? remote.error : null;
  const jump = (id: string) => {
    setLine(id);
    setTab("parser");
  };
  const labels = {
    evidence: "CV evidence found",
    mention: "Mention only",
    not_found: "Evidence not found",
    confirm: "Needs confirmation",
  };
  return (
    <section
      className="ats-report ats-detailed"
      aria-label="ATS readiness report"
    >
      <div className="ats-report-heading">
        <div>
          <h3>CV readability & job fit</h3>
          <p>
            Inspect the evidence, fix parsing risks and check your final file.
          </p>
        </div>
        <FileSearch size={24} aria-hidden="true" />
      </div>
      <p className="ats-report-summary">
        {report.issues.length} item{report.issues.length === 1 ? "" : "s"} to
        review. No employer ATS score or hiring prediction.
      </p>
      {loading && (
        <p role="status">
          Inspecting the saved file. No AI request or provider charge.
        </p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setReload((value) => value + 1)}>
            Reload file checks
          </button>
        </div>
      )}
      {report.parser.format === "text" && (
        <p className="ai-notice">
          Text-only check. Select a saved file to verify document layout and
          extraction.
        </p>
      )}
      {report.verification && (
        <div
          className="ats-export-state"
          role="status"
          data-state={report.verification.state}
        >
          {report.verification.state === "verified" ? (
            <CheckCircle2 size={19} />
          ) : (
            <AlertCircle size={19} />
          )}
          <div>
            <strong>
              {report.verification.state === "verified"
                ? "Exported file text verified"
                : "Export needs correction"}
            </strong>
            <p>{report.verification.detail}</p>
            <small>
              This checks the exact saved revision. Manual edits require a new
              check.
            </small>
          </div>
        </div>
      )}
      <div
        className="ai-report-tabs ats-report-tabs"
        role="group"
        aria-label="ATS report views"
      >
        {[
          ["findings", "Findings & fixes"],
          ["parser", "Parsed CV"],
          ["requirements", "Job requirements"],
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
      {tab === "findings" && (
        <div className="ats-action-list">
          {!report.issues.length && (
            <p>
              No issues detected by these checks. Review the parser output and
              employer requirements before applying.
            </p>
          )}
          {report.issues.map((issue) => (
            <article
              key={issue.id}
              className="ats-action"
              data-severity={issue.severity}
            >
              <div className="ats-action-heading">
                <strong>{issue.label}</strong>
                <span>{issue.severity} priority</span>
              </div>
              <p>{issue.detail}</p>
              <p className="ats-fix">
                <ArrowRight size={15} />
                <span>{issue.action}</span>
              </p>
              {issue.locations.length > 0 && (
                <small>Where: {issue.locations.join("; ")}</small>
              )}
            </article>
          ))}
        </div>
      )}
      {tab === "parser" && (
        <div className="ats-parser-preview">
          <h4>What the parser extracted</h4>
          <p>
            {report.parser.format.toUpperCase()}{" "}
            {report.parser.pageCount
              ? " / " + report.parser.pageCount + " page(s)"
              : " / page count not measured"}
            . Candidates below do not change your profile or application
            answers.
          </p>
          <div className="ats-fields">
            {report.parser.fields.map((field, index) => (
              <div className="ats-field" key={field.kind + index}>
                <span>{field.kind.replace("jobTitle", "job title")}</span>
                <div>
                  <strong>{field.value}</strong>
                  <small>
                    {field.confidence === "candidate"
                      ? "Needs your review"
                      : "Text detected"}
                  </small>
                </div>
                <button onClick={() => jump(field.sourceIds[0])}>
                  Show source
                </button>
              </div>
            ))}
          </div>
          {!report.parser.fields.length && (
            <p>
              No structured fields detected. Review the source or use a
              text-based CV.
            </p>
          )}
          <h4>Text in extracted order</h4>
          <p>
            Header/footer text is labelled separately and is excluded from the
            readable body comparison.
          </p>
          <ol className="ats-lines">
            {report.parser.lines.map((item) => (
              <li
                key={item.id}
                id={prefix + "-" + item.id}
                tabIndex={-1}
                data-selected={line === item.id}
              >
                <span>
                  <code>{item.id}</code>{" "}
                  {item.page ? "Page " + item.page + " / " : ""}
                  {item.section}
                </span>
                <p>{item.text}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
      {tab === "requirements" && (
        <div className="ats-requirements">
          <h4>Against this job description</h4>
          <p>
            Required and preferred wording is kept separate. A skill mention is
            weaker than a relevant project or role. Years, qualifications and
            eligibility still require review.
          </p>
          {!jobText.trim() && <p>Select a job to inspect its requirements.</p>}
          {jobText.trim() && !report.requirements.length && (
            <p>
              No reliable requirements were detected. Read the full posting;
              this is not a completed qualification review.
            </p>
          )}
          {report.requirements.map((requirement) => (
            <article key={requirement.id}>
              <div className="ats-action-heading">
                <strong>{requirement.priority}</strong>
                <span>{labels[requirement.assessment]}</span>
              </div>
              <blockquote>{requirement.text}</blockquote>
              <p>{requirement.explanation}</p>
              {requirement.evidence.map((evidence) => (
                <div className="ats-evidence-quote" key={evidence.lineId}>
                  <q>{evidence.quote}</q>
                  <button onClick={() => jump(evidence.lineId)}>
                    Source {evidence.lineId}
                  </button>
                </div>
              ))}
            </article>
          ))}
        </div>
      )}
      <details className="ats-limitations">
        <summary>Method and limitations</summary>
        <p>
          Engine {report.version}. Checks run without a model. File verification
          compares the exported readable text with the saved wording; it does
          not prove that an employer will parse the file identically.
        </p>
        <ul>
          {report.parser.limitations.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p>
          Formatting checks do not require changing your original. Make a
          separate readable copy when needed.{" "}
          <a href="/ats-methodology">Benchmark methodology</a>
        </p>
      </details>
    </section>
  );
}
