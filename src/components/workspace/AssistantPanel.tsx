"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, useResource } from "./client";
import type { AssistantMeta } from "./ProfileStudio";
export type Draft = {
  id: string;
  kind: string;
  content: string;
  revision: number;
  approvedHash: string | null;
  citations: { factId: string; quote: string }[];
};
export type Generation = {
  id: string;
  jobId: string;
  job: { title: string; employer: string };
  profileVersionId: string;
  settings: { model: string; resume?: { id: string; sha256: string } | null };
  jobSnapshot?: {
    title: string;
    employer: string;
    description: string;
    qualifications: string[];
  };
  state: string;
  error: string | null;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCost: number | null;
  actualCost: number | null;
  drafts: Draft[];
  analysis: {
    strengths: {
      requirement: string;
      evidence: { factId: string; quote: string };
    }[];
    gaps: { requirement: string; question: string }[];
    answers: { question: string; evidence: { quote: string } | null }[];
  } | null;
};
export function DraftEditor({
  draft,
  refresh,
}: {
  draft: Draft;
  refresh: () => void;
}) {
  const [content, setContent] = useState(draft.content),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => setContent(draft.content), [draft.content]);
  async function action(approve: boolean) {
    setBusy(true);
    setError("");
    try {
      await api(
        `workspace/drafts/${draft.id}${approve ? "/approve" : ""}`,
        approve ? "POST" : "PATCH",
        approve
          ? { revision: draft.revision, confirm: true }
          : { content, revision: draft.revision },
      );
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const dirty = content !== draft.content;
  return (
    <section className="draft-editor">
      <div className="panel-row">
        <h3>{draft.kind.replaceAll("_", " ")}</h3>
        <span>
          {dirty
            ? "Unsaved edits"
            : draft.approvedHash
              ? "Approved"
              : "Review required"}{" "}
          · v{draft.revision}
        </span>
      </div>
      <label>
        Editable preview
        <textarea
          aria-label={`${draft.kind} preview`}
          rows={9}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={80000}
        />
      </label>
      <p className="muted">
        {draft.revision > 1
          ? "Owner-edited content: verify every change before approval. Original AI citations below may not cover your edits."
          : "AI claims use exact quotes from reviewed facts. Review relevance and completeness before approval."}
      </p>
      <details>
        <summary>
          Original evidence references ({draft.citations.length})
        </summary>
        {draft.citations.map((c, i) => (
          <p key={i}>
            <code>{c.factId}</code>
            <br />
            {c.quote}
          </p>
        ))}
      </details>
      <div className="card-actions">
        <button disabled={busy || !dirty} onClick={() => void action(false)}>
          Save edit &amp; clear approval
        </button>
        <button
          className="primary"
          disabled={busy || dirty || Boolean(draft.approvedHash)}
          onClick={() => void action(true)}
        >
          Approve this version
        </button>
        {draft.approvedHash && !dirty && (
          <>
            <a href={`/api/workspace/drafts/${draft.id}/download`}>
              Download TXT
            </a>
            <a href={`/api/workspace/drafts/${draft.id}/download?format=docx`}>
              Download DOCX
            </a>
          </>
        )}
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function GenerationCard({
  run,
  refresh,
}: {
  run: Generation;
  refresh: () => void;
}) {
  return (
    <article className="upgrade-panel generation-card">
      <div className="panel-row">
        <div>
          <h2>{run.jobSnapshot?.title || run.job.title}</h2>
          <p>{run.jobSnapshot?.employer || run.job.employer}</p>
        </div>
        <span className="state-pill">{run.state}</span>
      </div>
      <details>
        <summary>Source versions and job snapshot</summary>
        <p>Reviewed profile: {run.profileVersionId}</p>
        <p>
          Original résumé reference:{" "}
          {run.settings.resume ? (
            <a
              href={`/api/workspace/resumes/${run.settings.resume.id}/original`}
            >
              {run.settings.resume.id}
            </a>
          ) : (
            "No original selected; claims come from reviewed facts."
          )}
        </p>
        {run.jobSnapshot && (
          <p style={{ whiteSpace: "pre-wrap" }}>
            {run.jobSnapshot.description}
          </p>
        )}
      </details>
      <p className="muted">
        Profile version {run.profileVersionId} · {run.settings.model} ·
        Generation {run.id}
      </p>
      <p>
        Estimate: {run.estimatedInputTokens} input / up to {run.maxOutputTokens}{" "}
        output tokens
        {run.estimatedCost !== null
          ? ` · $${run.estimatedCost.toFixed(4)} at configured rates`
          : " · Dollar cost unavailable (configure current model rates)"}
        . Recorded usage: {run.inputTokens ?? "unknown"} input /{" "}
        {run.outputTokens ?? "unknown"} output
        {run.actualCost !== null
          ? ` · $${run.actualCost.toFixed(4)} at configured rates`
          : ""}
        .
      </p>
      {run.error && (
        <p className="alert">
          {run.error}. No automatic retry. A pending or uncertain call may have
          consumed usage.
        </p>
      )}
      {run.analysis && (
        <details open>
          <summary>Suitability evidence &amp; missing information</summary>
          <p className="muted">
            Evidence relevance, not a hiring probability. Missing evidence is
            not proof that you lack a skill.
          </p>
          {run.analysis.strengths.map((s, i) => (
            <p key={i}>
              <strong>{s.requirement}</strong>
              <br />
              Reviewed evidence: {s.evidence.quote}{" "}
              <small>({s.evidence.factId})</small>
            </p>
          ))}
          {run.analysis.gaps.map((g, i) => (
            <p key={i}>
              <strong>Unknown: {g.requirement}</strong>
              <br />
              {g.question} <Link href="/profile">Add reviewed fact</Link>
            </p>
          ))}
        </details>
      )}
      {run.drafts.map((d) => (
        <DraftEditor
          key={`${d.id}-${d.revision}`}
          draft={d}
          refresh={refresh}
        />
      ))}
    </article>
  );
}
export default function AssistantPanel({
  jobId,
  jobText = "",
  onChanged,
}: {
  jobId?: string;
  jobText?: string;
  onChanged?: () => void;
}) {
  const runs = useResource<Generation[]>(
      `workspace/generations${jobId ? `?job=${jobId}` : ""}`,
    ),
    meta = useResource<AssistantMeta>("workspace/assistant");
  const [questions, setQuestions] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (runs.data) onChanged?.();
  }, [runs.data, onChanged]);
  useEffect(() => {
    if (!runs.data?.some((r) => r.state === "pending")) return;
    const timer = setInterval(runs.refresh, 5000);
    return () => clearInterval(timer);
  }, [runs.data, runs.refresh]);
  async function generate() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`workspace/generations/${jobId}`, "POST", {
        key: crypto.randomUUID(),
        questions: questions
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        language: "en",
      });
      runs.refresh();
    } catch (e) {
      setError((e as Error).message);
      runs.refresh();
    } finally {
      setBusy(false);
    }
  }
  const cfg = meta.data?.configuration;
  const estimate = Math.ceil(
    (JSON.stringify(meta.data?.profile?.facts || []).length +
      jobText.length +
      questions.length +
      1800) /
      3,
  );
  return (
    <>
      {jobId && (
        <section className="upgrade-panel assistant-controls">
          <span className="eyebrow">YOUR APPLICATION ASSISTANT</span>
          <h2>Prepare with evidence.</h2>
          <p>
            Select relevant profile facts, check suitability, and create
            job-specific résumé, cover-letter and answer drafts.
          </p>
          {cfg && !cfg.configured && (
            <p role="status" className="setup-note">
              Setup required: set AI_GATEWAY_API_KEY and AI_GATEWAY_MODEL on the
              server. Your stored jobs and manual tracker remain available.
            </p>
          )}
          <p>
            <Link href="/profile">Review profile &amp; résumé versions</Link>
          </p>
          <label>
            Application questions (one per line)
            <textarea
              rows={3}
              value={questions}
              maxLength={10000}
              onChange={(e) => {
                setQuestions(e.target.value);
                setConsent(false);
              }}
            />
          </label>
          <p>
            Provider: {cfg?.provider || "Loading…"} · Model:{" "}
            {cfg?.model || "Not configured"}
            <br />
            Estimated input: ~{estimate} tokens · Output cap: 3,000 tokens ·
            Daily cap: {cfg?.dailyLimit ?? 5} generations (UTC). JSearch
            allowance is separate.
          </p>
          <p>
            {cfg?.inputRate !== null &&
            cfg?.inputRate !== undefined &&
            cfg?.outputRate !== null &&
            cfg?.outputRate !== undefined
              ? `Estimated upper cost at configured rates: $${((estimate * cfg.inputRate + 3000 * cfg.outputRate) / 1e6).toFixed(4)}.`
              : "Model dollar rates are not configured. Token estimates are shown; confirm pricing with your provider before generating."}
          </p>
          <label className="checkline">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{" "}
            Send this job and reviewed facts to the configured AI provider. I
            understand usage may be charged.
          </label>
          <button
            className="primary"
            disabled={
              busy || !consent || !cfg?.configured || !meta.data?.profile
            }
            onClick={() => void generate()}
          >
            {busy
              ? "Preparing grounded drafts…"
              : "Analyze fit & generate drafts"}
          </button>
          <p className="muted">
            Only reviewed facts are sent. Exact-quote grounding prevents the AI
            from inventing profile claims. Repeated identical requests reuse the
            existing generation.
          </p>
        </section>
      )}
      {(error || runs.error || meta.error) && (
        <p className="alert" role="alert">
          {error || runs.error || meta.error}
        </p>
      )}
      {runs.loading && <p role="status">Loading application drafts…</p>}
      {!runs.loading && !runs.data?.length && (
        <div className="upgrade-empty">
          <h2>Room to prepare.</h2>
          <p>
            {jobId
              ? "Generate drafts when your profile and provider are ready."
              : "Prepare a job from your library, then generate and review its documents here."}
          </p>
          <Link href="/jobs">Browse opportunities</Link>
        </div>
      )}
      {runs.data?.map((run) => (
        <GenerationCard key={run.id} run={run} refresh={runs.refresh} />
      ))}
    </>
  );
}
