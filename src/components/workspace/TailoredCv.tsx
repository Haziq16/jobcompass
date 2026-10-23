"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Sparkles, FileText } from "lucide-react";
import { api, useResource } from "./client";
import { usePersonalAi } from "./PersonalAiContext";
import { ReviewWaiting } from "./ReviewWaiting";
import type { Run } from "./ai-studio-types";
import type { CvDocument } from "@/lib/tailored-cv-contracts";
import { evidenceBlocks } from "@/lib/resume-review-contracts";
import { keywordEvidenceText } from "@/lib/keyword-evidence";
import {
  isOriginalCv,
  type OriginalCvDocument,
  type CvSourceDocument,
} from "@/lib/original-cv-contracts";
import { OriginalCvEditor } from "./OriginalCvEditor";
type Draft = {
  id: string;
  state: string;
  error: string | null;
  provider: string;
  model: string;
  document: CvDocument | OriginalCvDocument | null;
  content: string | null;
  revision: number;
  approvedHash: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
};
const errors: Record<string, string> = {
  cv_unsupported_source:
    "The model cited missing source material. No CV draft was accepted. Review the original CV or choose another model before deliberately starting a new version.",
  cv_unsupported_number:
    "The model added a number or metric not found in its cited source. The CV draft was rejected to protect your factual accuracy.",
  cv_unsupported_skill:
    "The model added a recognized skill not found in its cited source. No CV draft was accepted.",
  cv_context_required:
    "The model omitted essential role or qualification context. No CV draft was accepted.",
  cv_review_required: "Check your CV before downloading it.",
  revision_conflict:
    "This draft changed in another tab. Reload the saved versions before editing or downloading.",
  draft_not_found: "This CV draft is no longer available.",
};
function CvPaper({ text }: { text: string }) {
  const headings = new Set([
    "SUMMARY",
    "EXPERIENCE",
    "PROJECTS",
    "EDUCATION",
    "SKILLS",
    "CERTIFICATIONS",
    "ADDITIONAL EXPERIENCE",
  ]);
  return (
    <div className="ai-cv-paper" aria-label="Tailored CV preview">
      {text.split("\n").map((line, i) =>
        i === 0 ? (
          <h2 key={i}>{line}</h2>
        ) : headings.has(line.trim()) ? (
          <h3 key={i}>{line}</h3>
        ) : line.startsWith("- ") ? (
          <p className="ai-cv-bullet" key={i}>
            {line}
          </p>
        ) : line.trim() ? (
          <p key={i}>{line}</p>
        ) : (
          <div className="ai-cv-space" key={i} />
        ),
      )}
    </div>
  );
}
export function TailoredCv({
  review,
  onConnect,
  errorMessage,
  onUseForApplication,
}: {
  review: Run;
  onConnect: () => void;
  errorMessage: (code: string) => string;
  onUseForApplication?: (asset: { id: string; name: string }) => void;
}) {
  const { config, loading } = usePersonalAi();
  const [sourceDocument, setSourceDocument] = useState<CvSourceDocument | null>(
    (
      review.checks as typeof review.checks & {
        sourceDocument?: CvSourceDocument;
      }
    ).sourceDocument || null,
  );
  const [layout, setLayout] = useState<"original" | "clean">(
      sourceDocument ? "original" : "clean",
    ),
    [attaching, setAttaching] = useState(false);
  const history = useResource<{ drafts: Draft[] }>(
    `ai/reviews/${review.id}/cv`,
  );
  const [draft, setDraft] = useState<Draft | null>(null),
    [text, setText] = useState(""),
    [consent, setConsent] = useState(false),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [view, setView] = useState("preview");
  const selected = useRef<string | null>(null),
    request = useRef<{ fingerprint: string; key: string } | null>(null);
  function choose(value: Draft) {
    selected.current = value.id;
    setDraft(value);
    setText(value.content || "");
    setChecked(Boolean(value.approvedHash));
    setError("");
  }
  useEffect(() => {
    const rows = history.data?.drafts;
    if (!rows?.length) return;
    const next = selected.current
      ? rows.find((row) => row.id === selected.current)
      : rows[0];
    if (
      next &&
      (!selected.current ||
        (next.state !== "pending" && draft?.state === "pending"))
    )
      choose(next);
  }, [history.data, draft?.state]);
  const connected =
    !loading &&
    Boolean(
      config.model && (config.saved || config.apiKey.trim().length >= 12),
    );
  const failed = (code: string) =>
    errors[code] ||
    {
      "This draft changed in another tab. Reload before editing or approving.":
        errors.revision_conflict,
      "AI daily generation limit reached. Existing drafts remain available.":
        "Your daily AI allowance is used. Your saved CV versions remain available.",
    }[code] ||
    errorMessage(code);
  async function generate() {
    if (!connected || !consent || busy) return;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify([
      review.id,
      config.provider,
      config.model,
      layout,
    ]);
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const value = await api<Draft>(`ai/reviews/${review.id}/cv`, "POST", {
        provider: config.provider,
        model: config.model,
        ...(config.saved
          ? { useSavedConnection: true }
          : { apiKey: config.apiKey }),
        consent: true,
        layout,
        requestKey: request.current.key,
      });
      choose(value);
      history.refresh();
      if (value.state !== "succeeded" && value.state !== "pending")
        setError(failed(value.error || "provider_failed_or_invalid_output"));
    } catch (e) {
      setError(failed((e as Error).message));
      history.refresh();
    } finally {
      setBusy(false);
    }
  }
  async function save(approved: boolean) {
    if (!draft) throw new Error("draft_not_found");
    const value = await api<Draft>(`ai/cv-drafts/${draft.id}`, "PATCH", {
      content: text,
      revision: draft.revision,
      approved,
    });
    choose(value);
    history.refresh();
    return value;
  }
  async function saveEdits() {
    setSaving(true);
    setError("");
    try {
      await save(false);
    } catch (e) {
      setError(failed((e as Error).message));
    } finally {
      setSaving(false);
    }
  }
  async function reloadVersion() {
    if (!draft || saving || busy) return;
    setSaving(true);
    setError("");
    try {
      const result = await api<{ drafts: Draft[] }>(
        `ai/reviews/${review.id}/cv`,
      );
      const current = result.drafts.find((row) => row.id === draft.id);
      if (!current) throw new Error("draft_not_found");
      choose(current);
      history.refresh();
    } catch (e) {
      setError(failed((e as Error).message));
    } finally {
      setSaving(false);
    }
  }
  async function download(format: "docx" | "txt") {
    if (!checked || saving || text.trim().length < 50) return;
    setSaving(true);
    setError("");
    try {
      const current = await save(true);
      const response = await fetch(
        `/api/ai/cv-drafts/${current.id}/download?format=${format}&revision=${current.revision}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `tailored-cv.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(failed((e as Error).message));
    } finally {
      setSaving(false);
    }
  }
  async function saveForApplication() {
    if (!checked || saving) return;
    setSaving(true);
    setError("");
    try {
      const current = await save(true);
      const asset = await api<{ id: string; name: string }>(
        `ai/cv-drafts/${current.id}/use`,
        "POST",
        { revision: current.revision },
      );
      onUseForApplication?.(asset);
    } catch (e) {
      setError(failed((e as Error).message));
    } finally {
      setSaving(false);
    }
  }
  const blocks = evidenceBlocks(
    [review.resumeSnapshot, keywordEvidenceText(review.checks)]
      .filter(Boolean)
      .join("\n"),
  );
  const paragraphs =
    draft?.document && !isOriginalCv(draft.document)
      ? [
          ...draft.document.summary,
          ...draft.document.sections.flatMap((s) =>
            s.entries.flatMap((e) => e.points),
          ),
        ]
      : [];
  return (
    <div className="ai-tailored-cv">
      <div className="ai-section-top">
        <div>
          <h3>A full CV for this opportunity</h3>
          <p>
            Tailored wording in your chosen layout, using the CV saved with this
            review. Keep your original Word format or choose a new single-column
            layout.
          </p>
        </div>
        <FileText size={22} />
      </div>
      <div className="cv-template-choice">
        <div>
          <strong>
            {sourceDocument
              ? sourceDocument.name
              : "Keep your original Word layout"}
          </strong>
          <p>
            {sourceDocument
              ? "Original template linked. Fonts, styles, margins and paragraph structure are retained for original-format drafts."
              : "Attach the same DOCX used for this review to tailor inside its original format. Matching the source does not use AI."}
          </p>
        </div>
        {!sourceDocument && (
          <label className="ai-upload-button">
            {attaching ? "Checking original…" : "Attach matching DOCX"}
            <input
              type="file"
              accept=".docx"
              disabled={busy || attaching}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setAttaching(true);
                setError("");
                try {
                  const form = new FormData();
                  form.set("file", file);
                  form.set("reviewId", review.id);
                  const response = await fetch("/api/ai/cv-source", {
                    method: "POST",
                    body: form,
                  });
                  const value = await response.json();
                  if (!response.ok) throw new Error(value.error);
                  setSourceDocument(value.sourceDocument);
                  setLayout("original");
                } catch (err) {
                  setError(
                    (err as Error).message === "cv_source_mismatch"
                      ? "This file’s text does not match the CV saved with this review. Attach its original DOCX or start a new review using the new file."
                      : "The original DOCX could not be attached. Use a standard Word file under 3 MB.",
                  );
                } finally {
                  setAttaching(false);
                }
              }}
            />
          </label>
        )}
        {sourceDocument && (
          <a href={`/api/ai/cv-source/${sourceDocument.id}`}>
            Download original
          </a>
        )}
        {!draft && (
          <label>
            Document layout
            <select
              aria-label="Document layout"
              disabled={busy || attaching}
              value={layout}
              onChange={(e) =>
                setLayout(e.target.value as "original" | "clean")
              }
            >
              <option value="original" disabled={!sourceDocument}>
                Keep original Word format
              </option>
              <option value="clean">New single-column format</option>
            </select>
          </label>
        )}
      </div>
      {history.loading && <p role="status">Loading saved CV versions…</p>}
      {history.error && (
        <p role="alert">
          Saved CV versions could not be loaded.{" "}
          <button onClick={history.refresh}>Reload versions</button>
        </p>
      )}
      {Boolean(history.data?.drafts.length) && (
        <label>
          CV versions
          <select
            aria-label="CV versions"
            disabled={busy || saving}
            value={draft?.id || ""}
            onChange={(e) => {
              const value = history.data?.drafts.find(
                (row) => row.id === e.target.value,
              );
              if (value) choose(value);
            }}
          >
            <option value="">Select a saved version</option>
            {history.data!.drafts.map((row) => (
              <option key={row.id} value={row.id}>
                {new Date(row.createdAt).toLocaleString()} · {row.model} ·{" "}
                {row.state}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p className="ai-error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <ReviewWaiting
          title="Writing your tailored CV"
          detail="The model is rewriting supported experience for this opportunity. Compare the draft with your original CV before downloading."
        />
      )}
      {!draft && !busy && (
        <section className="ai-cv-generate">
          <h4>Generate a tailored version</h4>
          <p>
            {sourceDocument && layout === "original"
              ? "The model proposes wording changes inside your original Word paragraphs. Styles, sections, headings and document parts stay in the source template. Longer wording can change page breaks."
              : "The model can rewrite your summary and bullets, emphasize relevant experience, and organize your CV. Role, employer and date blocks are copied from the original."}{" "}
            Source links and basic fact checks support your review; they cannot
            prove that rewritten meaning is accurate.
          </p>
          {!connected ? (
            <button onClick={onConnect}>Connect AI to continue</button>
          ) : (
            <p className="ai-fine-print">
              Using {config.provider} / {config.model}
              {config.saved ? " · Saved connection" : ""}
            </p>
          )}
          <label className="ai-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I agree to send this review’s original CV and job to my selected
              provider to generate a tailored CV. This is a separate request and
              may be charged.
            </span>
          </label>
          <button
            className="primary"
            disabled={!connected || !consent || history.loading}
            onClick={() => void generate()}
          >
            <Sparkles size={16} />
            Generate tailored CV
          </button>
          <p className="ai-fine-print">
            One explicit request. No automatic retries. Uses the same daily AI
            allowance as reviews.
          </p>
        </section>
      )}
      {draft && draft.state !== "succeeded" && !busy && (
        <div className="ai-run-state">
          <h4>
            {draft.state === "pending"
              ? "Your CV draft is still running"
              : "This CV draft wasn’t completed"}
          </h4>
          <p>
            {draft.error
              ? failed(draft.error)
              : "Reload saved versions to check this request without sending another one."}
          </p>
          {draft.state === "pending" && (
            <button onClick={history.refresh}>Reload CV status</button>
          )}
        </div>
      )}
      {draft?.state === "succeeded" && isOriginalCv(draft.document) && (
        <OriginalCvEditor
          key={draft.id}
          draft={{ ...draft, document: draft.document }}
          jobText={review.jobSnapshot.description}
          onUseForApplication={onUseForApplication}
          onSaved={(value) => {
            choose(value as Draft);
            history.refresh();
          }}
        />
      )}
      {draft?.state === "succeeded" && !isOriginalCv(draft.document) && (
        <>
          <p className="ai-notice">
            AI-assisted draft. Check the wording against the sources before
            using it. Source references and basic number/skill checks passed;
            meaning, completeness and factual relationships still need your
            review.
          </p>
          <div
            className="ai-report-tabs"
            role="group"
            aria-label="CV workspace"
          >
            {[
              ["preview", "CV preview"],
              ["edit", "Edit CV"],
              ["sources", "Compare with sources"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={view === key}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "preview" && <CvPaper text={text} />}
          {view === "edit" && (
            <label>
              Tailored CV text
              <textarea
                aria-label="Tailored CV text"
                rows={22}
                maxLength={50000}
                value={text}
                disabled={saving}
                onChange={(e) => {
                  setText(e.target.value);
                  setChecked(false);
                }}
              />
            </label>
          )}
          {view === "sources" && (
            <div className="ai-cv-sources">
              <p>
                This compares the generated wording with its original source
                blocks. Later manual edits are not automatically verified.
              </p>
              {paragraphs.map((point, i) => (
                <article key={i}>
                  <h4>Draft wording</h4>
                  <p>{point.text}</p>
                  <details>
                    <summary>
                      Show original evidence ({point.sourceIds.length})
                    </summary>
                    {point.sourceIds.map((id) => (
                      <blockquote key={id}>
                        <p>{blocks.find((b) => b.id === id)?.text}</p>
                        <cite>Original CV · {id}</cite>
                      </blockquote>
                    ))}
                  </details>
                </article>
              ))}
              <details>
                <summary>Read the complete original CV</summary>
                <pre>{review.resumeSnapshot}</pre>
              </details>
            </div>
          )}
          <div className="ai-cv-save">
            <button
              disabled={
                saving || text.trim().length < 50 || text === draft.content
              }
              onClick={() => void saveEdits()}
            >
              Save edits
            </button>
            <button
              disabled={saving || busy}
              onClick={() => void reloadVersion()}
            >
              Reload saved version
            </button>
            <span>Revision {draft.revision} · Private to your account</span>
          </div>
          <label className="ai-consent">
            <input
              type="checkbox"
              checked={checked}
              disabled={saving}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>
              I have checked the wording, employers, roles, dates, metrics and
              qualifications against my original CV.
            </span>
          </label>
          <div className="ai-cv-downloads">
            {onUseForApplication && (
              <button
                disabled={!checked || saving || !text.trim()}
                onClick={() => void saveForApplication()}
              >
                Use this CV for application
              </button>
            )}
            <button
              className="primary"
              disabled={!checked || saving || text.trim().length < 50}
              onClick={() => void download("docx")}
            >
              <Download size={16} />
              Download Word CV
            </button>
            <button
              disabled={!checked || saving || text.trim().length < 50}
              onClick={() => void download("txt")}
            >
              <Download size={16} />
              Download CV text
            </button>
          </div>
          <p className="ai-fine-print">
            Downloads save the exact version you checked. Editing clears
            confirmation; another tab’s changes require you to reload.
          </p>
        </>
      )}
      {draft && !busy && draft.state !== "pending" && (
        <button
          className="ai-cv-new"
          disabled={saving}
          onClick={() => {
            selected.current = "new";
            setDraft(null);
            setText("");
            request.current = null;
            setConsent(false);
            setChecked(false);
            setError("");
          }}
        >
          Prepare another CV version
        </button>
      )}
      {draft && (
        <details className="ai-usage">
          <summary>CV model & usage</summary>
          <p>
            {draft.provider} / {draft.model} · {draft.inputTokens ?? "Unknown"}{" "}
            input / {draft.outputTokens ?? "unknown"} output tokens. Provider
            pricing applies.
          </p>
        </details>
      )}
    </div>
  );
}
