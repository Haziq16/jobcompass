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
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { api, useResource } from "./client";
import { usePersonalAi } from "./PersonalAiContext";
import { resumeChecks } from "@/lib/resume-checks";
import type { Job, Run } from "./ai-studio-types";
import { Checks } from "./AiReviewChecks";
import { ReviewResult } from "./AiReviewResult";
import { ReviewWaiting } from "./ReviewWaiting";

const messages: Record<string, string> = {
  model_list_unavailable:
    "The provider’s model list could not be loaded. You can enter an available model ID manually. No generation was requested.",
  model_list_timeout:
    "The provider’s model list took too long to respond. No review was sent. Try loading the list again or enter a model ID.",
  saved_connection_missing:
    "Your saved connection was removed or belongs to another provider. Enter a key to save a new connection.",
  saved_connection_unreadable:
    "Your saved key could not be unlocked. Replace it with a new key and save the connection again.",
  connection_storage_unavailable:
    "Secure connection storage is unavailable. You can still use a key for this tab only.",
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
export default function AiStudio() {
  const router = useRouter(),
    params = useSearchParams();
  const {
    config,
    setConfig,
    forget,
    loading: connectionLoading,
  } = usePersonalAi();
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
  const [modelStatus, setModelStatus] = useState(""),
    [modelError, setModelError] = useState("");
  const [savingConnection, setSavingConnection] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const providerReady = Boolean(
    !connectionLoading &&
    (config.saved || config.apiKey.trim().length >= 12) &&
    config.model.trim(),
  );
  const providerRef = useRef<HTMLDetailsElement>(null);
  const waitingRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const initialised = useRef(false),
    request = useRef<{ fingerprint: string; key: string } | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const runId = run?.id;
  useEffect(() => {
    if (runId)
      reportRef.current?.scrollIntoView({
        behavior: "instant",
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
  function connectProvider() {
    setProviderOpen(true);
    providerRef.current?.scrollIntoView({
      block: "center",
      behavior: "instant",
    });
  }
  function newRequest() {
    if (busy) return;
    request.current = null;
    setConsent(false);
    setRun(null);
    if (selectedReview)
      router.replace(
        `/assistant?source=${source}&jobId=${encodeURIComponent(jobId)}`,
        { scroll: false },
      );
    setNotice(
      "New request ready. Review your inputs and confirm provider usage; a new attempt may incur another charge.",
    );
  }
  function editReviewedCv() {
    if (!run || busy) return;
    changeResume(run.resumeSnapshot);
    request.current = null;
    changeJob(run.jobSnapshot.id, run.jobSnapshot.source);
    setRun(null);
    setNotice(
      "The reviewed CV and job are loaded for editing. Nothing is sent until you confirm and run a new review.",
    );
    window.requestAnimationFrame(() =>
      document.getElementById("ai-resume-text")?.focus(),
    );
  }
  async function loadModels() {
    setLoadingModels(true);
    setModelError("");
    setModelStatus("");
    try {
      const result = await api<{
        models: { id: string; name: string }[];
        partial: boolean;
      }>("ai/models", "POST", {
        provider: config.provider,
        ...(config.saved
          ? { useSavedConnection: true }
          : { apiKey: config.apiKey }),
      });
      setModels(result.models);
      setModelStatus(
        result.models.length
          ? `${result.models.length} models loaded. Choose one below.${result.partial ? " The list is partial; you can also enter an ID manually." : ""}`
          : "Your provider returned no models for this key. Check its model-list permissions, or enter an available model ID manually.",
      );
    } catch (e) {
      setModels([]);
      setModelError(message((e as Error).message));
    } finally {
      setLoadingModels(false);
    }
  }
  async function saveProviderConnection() {
    if (!providerReady) return;
    setSavingConnection(true);
    setModelError("");
    try {
      await api("ai/connection", "PUT", {
        provider: config.provider,
        model: config.model,
        ...(config.saved
          ? { useSavedConnection: true }
          : { apiKey: config.apiKey }),
      });
      setConfig({ ...config, apiKey: "", saved: true });
      setProviderOpen(false);
      setNotice(
        "Connection saved securely. Your provider and model will be ready after refresh or your next sign-in.",
      );
    } catch (e) {
      setModelError(message((e as Error).message));
    } finally {
      setSavingConnection(false);
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
    if (!ready || !context.data?.job) return;
    setBusy(true);
    setRun(null);
    setError("");
    setNotice("");
    window.requestAnimationFrame(() =>
      waitingRef.current?.scrollIntoView({
        block: "center",
        behavior: "instant",
      }),
    );
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
        ...(config.saved
          ? { useSavedConnection: true }
          : { apiKey: config.apiKey }),
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
      const code = (e as Error).message;
      setError(
        messages[code] ||
          "We couldn’t receive the result. Check recent reviews before starting another request; your provider may already have processed it.",
      );
      history.refresh();
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
    context.data.job.id === jobId &&
    context.data.job.description.trim().length >= 100 &&
    !context.loading &&
    providerReady &&
    resume.trim().length >= 100 &&
    resume.trim().length <= 40000 &&
    reviewed &&
    consent &&
    !busy,
  );
  return (
    <section id="ai-studio" aria-labelledby="ai-studio-title">
      <header className="ai-heading">
        <div>
          <p className="eyebrow">PREPARE YOUR NEXT APPLICATION</p>
          <h1 id="ai-studio-title">AI studio</h1>
          <p>
            See where your experience fits. Know what to improve before you
            apply.
          </p>
        </div>
        <span className="ai-private-badge">
          <KeyRound size={15} />
          Private to your account
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
            <p className="ai-error" role="alert" ref={errorRef} tabIndex={-1}>
              {error}
            </p>
          )}
        </div>
      )}
      <div className="ai-layout">
        <div className="ai-inputs">
          {run && (
            <div ref={reportRef}>
              <ReviewResult
                key={run.id}
                run={run}
                onDelete={removeReview}
                onNew={newRequest}
                onEdit={editReviewedCv}
                errorMessage={message}
              />
              {run.state === "pending" && (
                <button
                  onClick={() =>
                    void api<Run>(`ai/reviews/${run.id}`)
                      .then(setRun)
                      .catch(() =>
                        setError(
                          "Could not reload this review. No new provider request was sent.",
                        ),
                      )
                  }
                >
                  Reload report
                </button>
              )}
            </div>
          )}
          {busy && (
            <div ref={waitingRef}>
              <ReviewWaiting />
            </div>
          )}
          <details
            className="ai-composer"
            key={run?.id || "new"}
            open={!run || busy}
          >
            <summary>
              {run
                ? "Review inputs or prepare another application"
                : "Your application"}
              <span>Job → CV → Review</span>
            </summary>
            <div className="ai-composer-content">
              <section className="ai-panel">
                <h2>
                  <Search size={19} />
                  <span className="ai-step-number">1</span> The opportunity
                </h2>
                {context.loading && (
                  <p role="status">Loading your selected job…</p>
                )}
                {context.data?.job && (
                  <div className="ai-selected-job">
                    <span>REVIEWING FOR</span>
                    <h3>{context.data.job.title}</h3>
                    <p>{context.data.job.employer}</p>
                  </div>
                )}
                <details
                  className="ai-job-picker"
                  open={!context.data?.job}
                  key={jobId || "choose"}
                >
                  <summary>
                    {context.data?.job
                      ? "Change opportunity"
                      : "Find a job to review"}
                  </summary>
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
                          disabled={busy}
                          maxLength={150}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Title, skill or company"
                        />
                      </label>
                      <button disabled={busy}>Search</button>
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
                            {context.data.job.title} —{" "}
                            {context.data.job.employer}
                          </option>
                        )}
                      {jobs.data?.jobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.title} — {j.employer}
                        </option>
                      ))}
                    </select>
                  </label>
                  {jobs.error && (
                    <p role="alert">
                      Jobs could not be loaded. Try your search again.
                    </p>
                  )}
                  {!jobs.loading &&
                    !jobs.error &&
                    jobs.data?.jobs.length === 0 && (
                      <p>No matching jobs. Try another title or company.</p>
                    )}
                </details>
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
                      {context.data.job.description ||
                        "No description supplied."}
                    </pre>
                  </details>
                )}
              </section>
              <section className="ai-panel">
                <div className="ai-section-top">
                  <h2>
                    <FileText size={19} />
                    <span className="ai-step-number">2</span> Your CV
                  </h2>
                  <Link href="/profile">Edit saved profile</Link>
                </div>
                <p>
                  {resume
                    ? "Your text is ready to review. Edits here only affect this application."
                    : "Use your saved CV, import a file, or paste your text below."}
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
                    id="ai-resume-text"
                    aria-label="Résumé text to review"
                    value={resume}
                    onChange={(e) => changeResume(e.target.value)}
                    rows={8}
                    disabled={busy}
                    placeholder="Paste or import your résumé. Keep roles, employers, dates, skills and achievements truthful."
                  />
                </label>
                <p className="ai-character-count">
                  {resume.length.toLocaleString()} / 40,000 characters
                </p>
                {resume.trim() && (
                  <details className="ai-free-checks">
                    <summary>
                      <CheckCircle2 size={16} /> Free text checks{" "}
                      <span>
                        {liveChecks.mentioned} of {liveChecks.total} recognised
                        job keywords found
                      </span>
                    </summary>
                    <Checks checks={liveChecks} />
                  </details>
                )}
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
                  <span className="ai-step-number">3</span> Get your application
                  review
                </h2>
                <p>
                  Get matching experience, gaps to clarify and a CV action plan.
                  Your CV and this job are sent to{" "}
                  <strong>{config.provider}</strong> using your own key. The
                  provider may charge you. Inputs and results are saved
                  privately in JobCompass.
                </p>
                {!providerReady && (
                  <div className="ai-connect-prompt">
                    <KeyRound size={18} />
                    <div>
                      <strong>Connect your AI provider to continue</strong>
                      <p>Free text checks work without a key.</p>
                    </div>
                    <button onClick={connectProvider}>
                      Connect AI <ArrowRight size={16} />
                    </button>
                  </div>
                )}
                <label className="ai-consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={busy}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    I agree to send these inputs to the selected provider and
                    use my API allowance for this request.
                  </span>
                </label>
                <p className="ai-readiness" aria-live="polite">
                  {!context.data?.job
                    ? "Choose a job to begin."
                    : context.data.job.description.trim().length < 100
                      ? "This posting needs a fuller description. Choose another job."
                      : resume.trim().length < 100
                        ? "Add at least 100 characters of CV text."
                        : resume.trim().length > 40000
                          ? "Shorten your CV to 40,000 characters."
                          : !providerReady
                            ? "Connect a provider using the panel on the right (below on mobile)."
                            : !reviewed
                              ? "Confirm that you’ve checked your CV text."
                              : !consent
                                ? "Confirm provider usage to enable your review."
                                : "Ready to review. One request, using your provider account."}
                </p>
                <button
                  className="primary"
                  disabled={!ready}
                  onClick={() => void generate()}
                >
                  <Sparkles size={17} />
                  {busy ? "Reviewing…" : "Run AI review"}
                </button>
                <p className="ai-fine-print">
                  No automatic retries. Allow up to four minutes for your
                  provider.
                </p>
                {request.current && (
                  <button disabled={busy} onClick={newRequest}>
                    Start a new request
                  </button>
                )}
              </section>
            </div>
          </details>
        </div>
        <aside className="ai-sidebar">
          <details
            ref={providerRef}
            className="ai-panel ai-provider"
            open={providerOpen}
            onToggle={(e) => setProviderOpen(e.currentTarget.open)}
          >
            <summary>
              <KeyRound size={17} />
              <span>
                AI connection
                <small>
                  {providerReady
                    ? `${config.provider} · ${config.model}`
                    : "Connect when you’re ready"}
                </small>
              </span>
              <span className="ai-connection-state">
                {providerReady ? "Ready" : "Setup"}
              </span>
            </summary>
            <div className="ai-provider-content">
              <div className="ai-section-top">
                <h2>
                  <KeyRound size={19} />
                  Provider settings
                </h2>
                <span className="ai-small-badge">Optional AI</span>
              </div>
              <p>
                Save your connection once to keep your provider and model ready
                across sign-ins. Saved keys are encrypted and never sent back to
                your browser.
              </p>
              <div className="ai-provider-fields">
                <label>
                  Provider
                  <select
                    aria-label="Provider"
                    value={config.provider}
                    disabled={
                      busy ||
                      loadingModels ||
                      savingConnection ||
                      connectionLoading
                    }
                    onChange={(e) => {
                      setConfig({
                        provider: e.target.value as typeof config.provider,
                        model: "",
                        apiKey: "",
                        saved: false,
                      });
                      setModels([]);
                      setModelError("");
                      setModelStatus("");
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
                    disabled={
                      busy ||
                      loadingModels ||
                      savingConnection ||
                      connectionLoading
                    }
                    onChange={(e) => {
                      setConfig({
                        ...config,
                        apiKey: e.target.value,
                        saved: false,
                      });
                      setModels([]);
                      setModelStatus("");
                      setModelError("");
                      request.current = null;
                      setConsent(false);
                    }}
                    placeholder={
                      config.saved
                        ? "Key saved securely — enter only to replace"
                        : "Paste your provider key here"
                    }
                    data-lpignore="true"
                    data-1p-ignore="true"
                  />
                </label>
                {config.saved && (
                  <p className="ai-fine-print">
                    Your encrypted key is saved in this account. You don’t need
                    to enter it again.
                  </p>
                )}
              </div>
              <div className="ai-model-field">
                <button
                  disabled={
                    (!config.saved && config.apiKey.trim().length < 12) ||
                    loadingModels ||
                    busy ||
                    savingConnection ||
                    connectionLoading
                  }
                  onClick={() => void loadModels()}
                >
                  {loadingModels ? "Loading…" : "Load models"}
                </button>
                {loadingModels && (
                  <p role="status">
                    Fetching model IDs from {config.provider}… No review is
                    being generated.
                  </p>
                )}
                {modelError && (
                  <p className="ai-error" role="alert">
                    {modelError}
                  </p>
                )}
                {modelStatus && <p role="status">{modelStatus}</p>}
                <label>
                  Available models
                  <select
                    aria-label="Available models"
                    disabled={
                      busy ||
                      loadingModels ||
                      savingConnection ||
                      !models.length
                    }
                    value={config.model}
                    onChange={(e) => {
                      setConfig({ ...config, model: e.target.value });
                      setConsent(false);
                    }}
                  >
                    <option value="">
                      {models.length
                        ? "Choose a model"
                        : "Load models to see the list"}
                    </option>
                    {config.model &&
                      !models.some((m) => m.id === config.model) && (
                        <option value={config.model}>
                          {config.model}
                          {config.saved
                            ? " (saved selection)"
                            : " (manual selection)"}
                        </option>
                      )}
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name === m.id ? m.id : `${m.name} · ${m.id}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Model ID
                  <input
                    value={config.model}
                    maxLength={150}
                    disabled={
                      busy ||
                      loadingModels ||
                      savingConnection ||
                      connectionLoading
                    }
                    onChange={(e) => {
                      setConfig({ ...config, model: e.target.value });
                      setConsent(false);
                    }}
                    placeholder="Load models or enter an exact ID"
                  />
                </label>
                <button
                  disabled={
                    (!config.apiKey && !config.saved) ||
                    busy ||
                    loadingModels ||
                    savingConnection
                  }
                  onClick={() => {
                    void forget()
                      .then(() => {
                        setModels([]);
                        setModelStatus("");
                        setConsent(false);
                        setNotice(
                          "Saved connection and the key in this tab were removed.",
                        );
                      })
                      .catch(() =>
                        setModelError(
                          "Could not remove the connection. Try again.",
                        ),
                      );
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
              <button
                disabled={
                  !providerReady || busy || savingConnection || loadingModels
                }
                onClick={() => void saveProviderConnection()}
              >
                {savingConnection ? "Saving…" : "Save connection"}{" "}
                <CheckCircle2 size={15} />
              </button>
              <button
                disabled={
                  !providerReady || busy || savingConnection || loadingModels
                }
                onClick={() => setProviderOpen(false)}
              >
                {config.saved ? "Done" : "Use for this tab only"}
              </button>
              <details className="ai-privacy">
                <summary>Key privacy & billing</summary>
                <p>
                  Saving stores an encrypted key in your private account. Only
                  the server can unlock it for your selected provider; it never
                  appears in exports or browser storage. “Forget key” removes
                  it. A key used for this tab only clears on refresh or
                  sign-out. Your provider’s data and billing policies apply.
                </p>
              </details>
            </div>
          </details>

          <div className="ai-panel">
            <div className="ai-section-top">
              <h2>Recent reviews</h2>
              <button
                aria-label="Refresh recent reviews"
                disabled={history.loading}
                onClick={history.refresh}
              >
                Refresh
              </button>
            </div>
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
                  disabled={busy}
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
                    {{
                      succeeded: "Ready",
                      pending: "Running",
                      uncertain: "Check outcome",
                      failed: "Not completed",
                    }[r.state] || r.state}{" "}
                    · {new Date(r.createdAt).toLocaleDateString()}
                  </small>
                </button>
              ))
            ) : (
              <p className="muted">Your first review will appear here.</p>
            )}
            {history.error && <p>History could not be loaded.</p>}
          </div>
          <details className="ai-panel ai-explainer">
            <summary>How your review works</summary>
            <p>
              The review compares actual job requirements with quoted CV
              evidence. It suggests what to emphasize or clarify without
              inventing qualifications.
            </p>
            <p>
              It isn’t an employer’s ATS score or a prediction of hiring. Check
              the evidence before using any recommendation.
            </p>
          </details>
        </aside>
      </div>
    </section>
  );
}
