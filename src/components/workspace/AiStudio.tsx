"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  KeyRound,
  Search,
  Sparkles,
  Upload,
  Download,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { api, useResource } from "./client";
import { usePersonalAi } from "./PersonalAiContext";
import { resumeChecks, type ResumeChecks } from "@/lib/resume-checks";
import type { ReviewOutput } from "@/lib/resume-review-contracts";

type Job = {
  id: string;
  title: string;
  employer: string;
  description: string;
  source: "catalog" | "workspace";
};
type Run = {
  id: string;
  provider: string;
  model: string;
  state: string;
  error: string | null;
  report: ReviewOutput | null;
  checks: ResumeChecks;
  jobSnapshot: Job;
  resumeSnapshot: string;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
};
const messages: Record<string, string> = {
  model_list_unavailable:
    "The provider’s model list could not be loaded. You can enter an available model ID manually. No generation was requested.",
  provider_auth_failed:
    "The provider rejected this key or its permissions. Check the key in your provider account.",
  provider_credit_required:
    "Your provider requires credits or billing before this model can run.",
  provider_rate_limit:
    "Your provider rate limit was reached. No automatic retry was made.",
  provider_model_unavailable:
    "This model is not available to your provider account. Choose another model ID.",
  provider_timeout:
    "The review reached its time limit or the provider timed out before returning a result. It may have billed the request. No automatic retry was made.",
  provider_failed_or_invalid_output:
    "The provider failed or did not return the required structured output. It may have billed the request. Try a compatible text model only when you choose to run another review.",
  ungrounded_evidence:
    "The model returned résumé evidence that could not be verified. The result was rejected; no invented text was saved as a report.",
  ungrounded_requirement:
    "The model returned an unsupported job requirement. The result was rejected.",
  contradictory_evidence:
    "The model returned contradictory evidence. The result was rejected.",
  ai_review_in_progress:
    "Another review is still running. Open recent reviews to check it before starting another.",
  job_description_required:
    "This job does not have enough description text for a useful review. Choose another posting.",
  cv_no_text:
    "No text could be extracted. Use a text-based PDF/DOCX or paste your résumé text; image-only scans need OCR first.",
  cv_too_large: "Choose a PDF or DOCX smaller than 3 MB.",
  cv_too_many_pages:
    "This PDF exceeds 40 pages. Use a focused résumé or paste the relevant text for review.",
  unsupported_cv:
    "Use a standard PDF or DOCX without embedded objects, or paste plain text.",
  ai_disabled:
    "AI has been switched off. Discovery and your saved jobs are still available.",
  ai_not_available: "AI is not enabled for this account.",
  ai_daily_limit:
    "The daily review limit has been reached. Failed attempts also count; existing reports remain available.",
};
const message = (code: string) =>
  messages[code] ||
  "This request could not be completed. Check your inputs and try again when ready.";
function outlineText(run: Run) {
  if (!run.report) return "";
  return [
    "TAILORED EVIDENCE OUTLINE — REVIEW BEFORE USE",
    `Target: ${run.jobSnapshot.title} at ${run.jobSnapshot.employer}`,
    "Selected original excerpts, not a complete or rewritten résumé. Verify chronology and context against your full original.",
    ...run.report.outline.flatMap((section) => [
      "",
      section.heading.toUpperCase(),
      ...section.excerpts.map((e) => e.quote),
    ]),
  ].join("\n");
}
function download(run: Run) {
  const url = URL.createObjectURL(
    new Blob([outlineText(run)], { type: "text/plain;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "jobcompass-evidence-outline.txt";
  anchor.click();
  URL.revokeObjectURL(url);
}
function Checks({ checks }: { checks: ResumeChecks }) {
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
function ReviewResult({
  run,
  onDelete,
}: {
  run: Run;
  onDelete: () => Promise<void>;
}) {
  const [tab, setTab] = useState("requirements");
  return (
    <section className="ai-report" aria-labelledby="ai-report-title">
      <div className="ai-section-top">
        <div>
          <p className="eyebrow">YOUR PRIVATE REVIEW</p>
          <h2 id="ai-report-title">{run.jobSnapshot.title}</h2>
          <p>
            {run.jobSnapshot.employer} · {run.provider} / {run.model}
          </p>
        </div>
        <button
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
              ? "Review is running"
              : run.state === "uncertain"
                ? "Result uncertain"
                : "Review not completed"}
          </h3>
          <p>
            {run.error
              ? message(run.error)
              : "The request has already been dispatched. Reload this report shortly; no second provider request will be sent."}
          </p>
        </div>
      ) : (
        <>
          <p className="ai-report-note">
            <CheckCircle2 size={17} />
            Quotes were checked against the submitted text. Relevance and
            interpretation are AI judgments and still need your review.
          </p>
          <div
            className="ai-report-tabs"
            role="group"
            aria-label="Review sections"
          >
            <button
              aria-pressed={tab === "requirements"}
              onClick={() => setTab("requirements")}
            >
              Requirements & evidence
            </button>
            <button
              aria-pressed={tab === "outline"}
              onClick={() => setTab("outline")}
            >
              Tailored evidence outline
            </button>
            <button
              aria-pressed={tab === "checks"}
              onClick={() => setTab("checks")}
            >
              Text checks
            </button>
          </div>
          {tab === "requirements" && (
            <div className="ai-requirements">
              {run.report?.requirements.map((requirement, i) => (
                <article key={i}>
                  <div className="ai-requirement-meta">
                    <span>
                      {requirement.priority === "unspecified"
                        ? "Priority not explicit"
                        : requirement.priority}
                    </span>
                    <span className={`assessment-${requirement.assessment}`}>
                      {
                        {
                          supported: "Direct evidence suggested",
                          transferable: "Related / transferable",
                          not_evidenced: "Not evidenced in this CV",
                          unclear: "Needs clarification",
                        }[requirement.assessment]
                      }
                    </span>
                  </div>
                  <h3>“{requirement.jobQuote}”</h3>
                  <small>Quoted from the job posting</small>
                  {requirement.evidence.length ? (
                    requirement.evidence.map((e, j) => (
                      <blockquote key={j}>
                        <p>{e.quote}</p>
                        <cite>Résumé excerpt {e.blockId}</cite>
                      </blockquote>
                    ))
                  ) : (
                    <p>
                      No supporting résumé excerpt was supplied. This does not
                      prove you lack the qualification.
                    </p>
                  )}
                  {requirement.question && (
                    <p className="ai-question">
                      <strong>Review question:</strong> {requirement.question}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
          {tab === "outline" && (
            <div className="ai-outline">
              <p>
                This selects and reorders original text; it is not a complete
                résumé. Check that employers, roles, dates and context remain
                clear. Missing qualifications are not inserted.
              </p>
              <button onClick={() => download(run)}>
                <Download size={16} />
                Download text outline
              </button>
              <pre>{outlineText(run)}</pre>
              <details>
                <summary>Compare with the submitted résumé</summary>
                <pre>{run.resumeSnapshot}</pre>
              </details>
            </div>
          )}
          {tab === "checks" && <Checks checks={run.checks} />}
        </>
      )}
      <p className="ai-usage">
        {run.inputTokens !== null || run.outputTokens !== null
          ? `Provider-reported usage: ${run.inputTokens ?? "unknown"} input / ${run.outputTokens ?? "unknown"} output tokens.`
          : "Provider token usage was not available."}{" "}
        Costs are set by your provider. No shared JobCompass AI credits are
        used.
      </p>
    </section>
  );
}
export default function AiStudio() {
  const router = useRouter(),
    params = useSearchParams();
  const { config, setConfig, forget } = usePersonalAi();
  const source = params.get("source") === "workspace" ? "workspace" : "catalog";
  const jobId = params.get("jobId") || "";
  const selectedReview = params.get("review") || "";
  const context = useResource<{ resumeText: string; job: Job | null }>(
    `ai/context?source=${source}&jobId=${encodeURIComponent(jobId)}`,
  );
  const history = useResource<{
    reviews: Omit<Run, "resumeSnapshot" | "report" | "checks">[];
  }>("ai/reviews");
  const [query, setQuery] = useState(""),
    [submittedQuery, setSubmittedQuery] = useState("");
  const jobs = useResource<{
    jobs: { id: string; title: string; employer: string }[];
  }>(
    `${source === "catalog" ? "catalog" : "jobs"}?q=${encodeURIComponent(submittedQuery)}`,
  );
  const [resume, setResume] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [models, setModels] = useState<{ id: string; name: string }[]>([]),
    [loadingModels, setLoadingModels] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const initialised = useRef(false),
    request = useRef<{ fingerprint: string; key: string } | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const runId = run?.id;
  useEffect(() => {
    if (runId)
      reportRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  }, [runId]);
  const liveChecks = useMemo(
    () => resumeChecks(resume, context.data?.job?.description || ""),
    [resume, context.data?.job?.description],
  );
  useEffect(() => {
    if (context.data && !initialised.current) {
      setResume(context.data.resumeText);
      initialised.current = true;
    }
  }, [context.data]);
  useEffect(() => {
    let current = true;
    if (selectedReview)
      api<Run>(`ai/reviews/${encodeURIComponent(selectedReview)}`)
        .then((value) => {
          if (current) setRun(value);
        })
        .catch(() => {
          if (current) setError("Could not open this private review.");
        });
    return () => {
      current = false;
    };
  }, [selectedReview]);
  function changeResume(value: string) {
    setResume(value);
    setReviewed(false);
    setConsent(false);
    setNotice("");
  }
  function changeJob(id: string, nextSource = source) {
    setConsent(false);
    setError("");
    router.replace(
      `/assistant?source=${nextSource}&jobId=${encodeURIComponent(id)}`,
      { scroll: false },
    );
  }
  async function loadModels() {
    setLoadingModels(true);
    setError("");
    try {
      const result = await api<{
        models: { id: string; name: string }[];
        partial: boolean;
      }>("ai/models", "POST", {
        provider: config.provider,
        apiKey: config.apiKey,
      });
      setModels(result.models);
      setNotice(
        result.partial
          ? "Model list is partial. You can enter another model ID manually."
          : "Model IDs loaded. Choose a text model that supports structured output. No generation was requested.",
      );
    } catch (e) {
      setError(message((e as Error).message));
    } finally {
      setLoadingModels(false);
    }
  }
  async function upload(file: File) {
    setError("");
    if (file.size > 3 * 1024 * 1024) {
      setError(messages.cv_too_large);
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/ai/parse", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      changeResume(result.text);
      setNotice(
        result.truncated
          ? "The extracted text exceeds the 40,000-character review limit. Edit it below before running AI."
          : "Text extracted. Check for missing or reordered content before confirming it. No AI provider was contacted.",
      );
    } catch (e) {
      setError(message((e as Error).message));
    } finally {
      setUploading(false);
    }
  }
  async function generate() {
    if (!context.data?.job) return;
    setBusy(true);
    setError("");
    setNotice("");
    const fingerprint = JSON.stringify({
      source,
      jobId,
      resume,
      provider: config.provider,
      model: config.model,
    });
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await api<Run>("ai/reviews", "POST", {
        source,
        jobId,
        resumeText: resume,
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
        reviewed,
        consent,
        requestKey: request.current!.key,
      });
      setRun(result);
      history.refresh();
      if (result.state !== "succeeded")
        setNotice(
          "The request is recorded. A failed or uncertain run is not automatically retried.",
        );
    } catch (e) {
      setError(message((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function removeReview() {
    if (
      !run ||
      !window.confirm(
        "Delete this private AI review and its résumé snapshot? Your profile and jobs will remain.",
      )
    )
      return;
    try {
      await api(`ai/reviews/${run.id}`, "DELETE");
      setRun(null);
      history.refresh();
      setNotice("Review deleted.");
      if (selectedReview)
        router.replace(
          `/assistant?source=${source}&jobId=${encodeURIComponent(jobId)}`,
          { scroll: false },
        );
    } catch (e) {
      setError(message((e as Error).message));
    }
  }
  const ready = Boolean(
    context.data?.job &&
    config.apiKey.length >= 12 &&
    config.model &&
    resume.length >= 100 &&
    resume.length <= 40000 &&
    reviewed &&
    consent &&
    !busy,
  );
  return (
    <section id="ai-studio" aria-labelledby="ai-studio-title">
      <header className="ai-heading">
        <div>
          <p className="eyebrow">EVIDENCE BEFORE ASSUMPTIONS</p>
          <h1 id="ai-studio-title">AI studio</h1>
          <p>
            Review your résumé against a real job, with your own model and key.
          </p>
        </div>
        <span className="ai-private-badge">
          <KeyRound size={15} />
          Your key. Your account.
        </span>
      </header>
      {(notice || error) && (
        <div className="ai-feedback">
          {notice && (
            <p className="ai-notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="ai-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      <div className="ai-layout">
        <div className="ai-inputs">
          <section className="ai-panel">
            <div className="ai-section-top">
              <h2>
                <KeyRound size={19} />
                1. Choose your provider
              </h2>
              <span className="ai-small-badge">Optional AI</span>
            </div>
            <p>
              Your key stays in this tab’s memory. It is sent over HTTPS to
              JobCompass only for your selected provider request, and is never
              saved in our database, cookies or browser storage. Refreshing or
              signing out clears it.
            </p>
            <div className="ai-provider-fields">
              <label>
                Provider
                <select
                  aria-label="Provider"
                  value={config.provider}
                  disabled={busy || loadingModels}
                  onChange={(e) => {
                    setConfig({
                      provider: e.target.value as typeof config.provider,
                      model: "",
                      apiKey: "",
                    });
                    setModels([]);
                    setConsent(false);
                  }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="google">Google Gemini</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </label>
              <label>
                Your API key
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={config.apiKey}
                  maxLength={600}
                  disabled={busy}
                  onChange={(e) => {
                    setConfig({ ...config, apiKey: e.target.value });
                    request.current = null;
                    setConsent(false);
                  }}
                  placeholder="Paste your provider key here"
                  data-lpignore="true"
                  data-1p-ignore="true"
                />
              </label>
            </div>
            <div className="ai-model-field">
              <label>
                Model ID
                <input
                  list="ai-models"
                  value={config.model}
                  maxLength={150}
                  disabled={busy}
                  onChange={(e) => {
                    setConfig({ ...config, model: e.target.value });
                    setConsent(false);
                  }}
                  placeholder="Load models or enter an exact ID"
                />
              </label>
              <datalist id="ai-models">
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </datalist>
              <button
                disabled={config.apiKey.length < 12 || loadingModels || busy}
                onClick={() => void loadModels()}
              >
                {loadingModels ? "Loading…" : "Load models"}
              </button>
              <button
                disabled={!config.apiKey || busy}
                onClick={() => {
                  forget();
                  setNotice("API key removed from this tab.");
                }}
              >
                Forget key
              </button>
            </div>
            <p className="ai-fine-print">
              Loading model IDs does not generate text. Provider access,
              structured-output support and pricing vary. There is no fallback
              to a JobCompass-paid model.
            </p>
          </section>
          <section className="ai-panel">
            <h2>
              <Search size={19} />
              2. Choose the job
            </h2>
            <div className="ai-job-search">
              <label>
                Job source
                <select
                  aria-label="Job source"
                  value={source}
                  onChange={(e) =>
                    changeJob("", e.target.value as typeof source)
                  }
                  disabled={busy}
                >
                  <option value="catalog">Worldwide catalogue</option>
                  <option value="workspace">My jobs</option>
                </select>
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmittedQuery(query);
                }}
              >
                <label>
                  Find a job
                  <input
                    value={query}
                    maxLength={150}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Title, skill or company"
                  />
                </label>
                <button>Search</button>
              </form>
            </div>
            <label>
              Job to review
              <select
                aria-label="Job to review"
                value={jobId}
                disabled={busy || jobs.loading}
                onChange={(e) => changeJob(e.target.value)}
              >
                <option value="">Select an opportunity</option>
                {context.data?.job &&
                  !jobs.data?.jobs.some((j) => j.id === jobId) && (
                    <option value={jobId}>
                      {context.data.job.title} — {context.data.job.employer}
                    </option>
                  )}
                {jobs.data?.jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} — {j.employer}
                  </option>
                ))}
              </select>
            </label>
            {context.error && (
              <p role="alert">
                The selected job could not be loaded. Choose another job.
              </p>
            )}
            {context.data?.job && (
              <details className="ai-job-preview">
                <summary>Read the job description</summary>
                <h3>
                  {context.data.job.title} · {context.data.job.employer}
                </h3>
                <pre>
                  {context.data.job.description || "No description supplied."}
                </pre>
              </details>
            )}
          </section>
          <section className="ai-panel">
            <div className="ai-section-top">
              <h2>
                <FileText size={19} />
                3. Review your résumé text
              </h2>
              <Link href="/profile">Edit saved profile</Link>
            </div>
            <p>
              The saved profile is a starting point. Edits here affect this
              review only. Review the extracted text before sharing it with your
              AI provider.
            </p>
            <div className="ai-upload">
              <label className="ai-upload-button">
                <Upload size={16} />
                {uploading ? "Extracting text…" : "Import PDF or DOCX"}
                <input
                  type="file"
                  accept=".pdf,.docx"
                  disabled={uploading || busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <span>Up to 3 MB · text extraction only</span>
              <button
                disabled={busy || !context.data?.resumeText}
                onClick={() => changeResume(context.data?.resumeText || "")}
              >
                Use saved CV
              </button>
            </div>
            <label>
              Résumé text to review
              <textarea
                value={resume}
                onChange={(e) => changeResume(e.target.value)}
                rows={12}
                disabled={busy}
                placeholder="Paste or import your résumé. Keep roles, employers, dates, skills and achievements truthful."
              />
            </label>
            <p className="ai-character-count">
              {resume.length.toLocaleString()} / 40,000 characters
            </p>
            {resume.trim() && <Checks checks={liveChecks} />}
            <label className="ai-consent">
              <input
                type="checkbox"
                checked={reviewed}
                disabled={busy}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              <span>
                I have checked this résumé text for missing content, reading
                order and accuracy.
              </span>
            </label>
          </section>
          <section className="ai-panel ai-run-panel">
            <h2>
              <Sparkles size={19} />
              4. Run an evidence-based review
            </h2>
            <p>
              This shares the displayed résumé and job description with{" "}
              <strong>{config.provider}</strong>. Your provider may charge your
              account; its own data and billing policies apply. JobCompass saves
              the inputs and report privately so you can revisit or delete the
              review.
            </p>
            <label className="ai-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I agree to send these inputs to the selected provider and use my
                API allowance for this request.
              </span>
            </label>
            <button
              className="primary"
              disabled={!ready}
              onClick={() => void generate()}
            >
              <Sparkles size={17} />
              {busy ? "Reviewing…" : "Run AI review"}
            </button>
            {busy && (
              <p className="ai-fine-print" role="status">
                Waiting for your provider. Reasoning models can take several
                minutes; this request allows up to four minutes of provider
                time. Keep this tab open. No automatic retry will be made.
              </p>
            )}
            <p className="ai-fine-print">
              No automatic retries or background AI calls. A repeated click with
              unchanged inputs reopens the same request. For a deliberate new
              attempt, choose “Start a new request” below.
            </p>
            <button
              disabled={busy}
              onClick={() => {
                request.current = null;
                setConsent(false);
                setNotice(
                  "A new request is ready. Confirm provider usage before running it; it may incur another charge.",
                );
              }}
            >
              Start a new request
            </button>
          </section>
        </div>
        <aside className="ai-sidebar">
          <div className="ai-panel">
            <h2>Recent reviews</h2>
            <p>
              Private to your account. API keys are never part of a saved
              review.
            </p>
            {history.loading ? (
              <p>Loading…</p>
            ) : history.data?.reviews.length ? (
              history.data.reviews.map((r) => (
                <button
                  className={
                    run?.id === r.id
                      ? "ai-history-item active"
                      : "ai-history-item"
                  }
                  key={r.id}
                  onClick={() => {
                    setError("");
                    void api<Run>(`ai/reviews/${r.id}`)
                      .then(setRun)
                      .catch(() => setError("Could not load this review."));
                  }}
                >
                  <strong>{r.jobSnapshot.title}</strong>
                  <span>{r.jobSnapshot.employer}</span>
                  <small>
                    {r.state} · {new Date(r.createdAt).toLocaleDateString()}
                  </small>
                </button>
              ))
            ) : (
              <p className="muted">Your first review will appear here.</p>
            )}
            {history.error && <p>History could not be loaded.</p>}
          </div>
          <div className="ai-panel ai-explainer">
            <h3>What this can tell you</h3>
            <p>
              Which job requirements have relevant quoted evidence, which need
              clarification, and which original résumé excerpts may deserve more
              emphasis.
            </p>
            <h3>Keep the distinction clear</h3>
            <p>
              Keyword overlap is mechanical. Relevance is an AI interpretation.
              Neither is an employer’s ATS score, a guarantee of eligibility, or
              a prediction of hiring.
            </p>
          </div>
        </aside>
      </div>
      {run && (
        <div ref={reportRef}>
          <ReviewResult key={run.id} run={run} onDelete={removeReview} />
          {run.state === "pending" && (
            <button
              onClick={() =>
                void api<Run>(`ai/reviews/${run.id}`)
                  .then(setRun)
                  .catch(() => setError("Could not reload this review."))
              }
            >
              Reload report
            </button>
          )}
        </div>
      )}
    </section>
  );
}
