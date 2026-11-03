"use client";
import { useEffect, useState } from "react";
import { Download, Save } from "lucide-react";
import { api } from "./client";
import { DocxPreview } from "./DocxPreview";
import { AtsReport } from "./AtsReport";
import {
  originalText,
  type OriginalCvDocument,
} from "@/lib/original-cv-contracts";
type Draft = {
  id: string;
  document: OriginalCvDocument;
  content: string | null;
  revision: number;
  approvedHash: string | null;
};
export function OriginalCvEditor({
  draft,
  jobText,
  onSaved,
  onUseForApplication,
}: {
  draft: Draft;
  jobText: string;
  onSaved: (draft: unknown) => void;
  onUseForApplication?: (asset: { id: string; name: string }) => void;
}) {
  const [document, setDocument] = useState(draft.document),
    [view, setView] = useState("preview"),
    [checked, setChecked] = useState(Boolean(draft.approvedHash)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setDocument(draft.document);
    setChecked(Boolean(draft.approvedHash));
  }, [draft.id, draft.revision, draft.document, draft.approvedHash]);
  const content = originalText(document),
    dirty = content !== draft.content;
  async function save(approved: boolean) {
    const value = await api<Draft>(`ai/cv-drafts/${draft.id}`, "PATCH", {
      content,
      revision: draft.revision,
      approved,
      paragraphEdits: document.paragraphs
        .filter(
          (p) =>
            p.text !==
            draft.document.paragraphs.find((o) => o.id === p.id)?.text,
        )
        .map((p) => ({ id: p.id, text: p.text })),
    });
    onSaved(value);
    return value;
  }
  async function action(format?: "docx" | "txt" | "application") {
    setBusy(true);
    setError("");
    try {
      const value = await save(Boolean(format));
      if (format === "application") {
        const asset = await api<{ id: string; name: string }>(
          `ai/cv-drafts/${value.id}/use`,
          "POST",
          { revision: value.revision },
        );
        onUseForApplication?.(asset);
      } else if (format) {
        const response = await fetch(
          `/api/ai/cv-drafts/${value.id}/download?format=${format}&revision=${value.revision}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("download_failed");
        const url = URL.createObjectURL(await response.blob());
        const a = window.document.createElement("a");
        a.href = url;
        a.download = `tailored-original-format.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      setError(
        "This version could not be saved or downloaded. Reload saved versions if it changed in another tab.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="original-cv-editor">
      <div className="original-layout-badge">
        <span>ORIGINAL WORD FORMAT</span>
        <p>
          Your original styles, margins, sections, images and paragraph layout
          are retained. Review changed wording and final pagination before
          applying.
        </p>
      </div>
      <div
        className="ai-report-tabs"
        role="group"
        aria-label="Original-format CV workspace"
      >
        {[
          ["preview", "Document preview"],
          ["edit", "Edit wording"],
          ["ats", "ATS check"],
          ["compare", "Compare changes"],
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
      {error && (
        <p className="ai-error" role="alert">
          {error}
        </p>
      )}
      {view === "preview" && (
        <>
          {dirty && (
            <p role="status">Save edits to update the document preview.</p>
          )}
          <DocxPreview
            url={`/api/ai/cv-drafts/${draft.id}/preview?revision=${draft.revision}`}
            title="Tailored CV in original Word format"
          />
        </>
      )}
      {view === "edit" && (
        <div className="original-paragraph-editor">
          <p>
            Edit the wording inside existing paragraphs. Paragraphs stay in
            their original positions; no formatting is rebuilt.
          </p>
          {document.paragraphs
            .filter((p) => p.original.trim() || p.text.trim())
            .map((p) => (
              <label key={p.id}>
                <span>
                  {p.id}
                  {p.text !== p.original ? " · Changed" : ""}
                </span>
                <textarea
                  aria-label={`CV paragraph ${p.id}`}
                  rows={Math.max(2, Math.min(5, Math.ceil(p.text.length / 90)))}
                  maxLength={3000}
                  disabled={busy}
                  value={p.text}
                  onChange={(e) => {
                    setDocument((d) => ({
                      ...d,
                      paragraphs: d.paragraphs.map((row) =>
                        row.id === p.id
                          ? { ...row, text: e.target.value }
                          : row,
                      ),
                    }));
                    setChecked(false);
                  }}
                />
              </label>
            ))}
        </div>
      )}
      {view === "ats" && (
        <>
          <AtsReport
            text={content}
            jobText={jobText}
            findings={dirty ? undefined : document.findings}
            draftId={dirty ? undefined : draft.id}
            revision={draft.revision}
          />
          {dirty && (
            <p>Save this wording to rerun the document structure checks.</p>
          )}
        </>
      )}
      {view === "compare" && (
        <div className="cv-change-list">
          {document.paragraphs
            .filter((p) => p.text !== p.original)
            .map((p) => (
              <article key={p.id}>
                <span>{p.id}</span>
                <div>
                  <h4>Original</h4>
                  <p>{p.original}</p>
                </div>
                <div>
                  <h4>Tailored</h4>
                  <p>{p.text}</p>
                </div>
              </article>
            ))}
        </div>
      )}
      <div className="ai-cv-save">
        <button disabled={!dirty || busy} onClick={() => void action()}>
          <Save size={16} />
          Save wording
        </button>
        <span>Revision {draft.revision} · Private to your account</span>
      </div>
      <label className="ai-consent">
        <input
          type="checkbox"
          checked={checked}
          disabled={busy}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>
          I have checked the wording, facts, original-format preview and ATS
          findings before downloading.
        </span>
      </label>
      <div className="ai-cv-downloads">
        {onUseForApplication && (
          <button
            disabled={!checked || busy}
            onClick={() => void action("application")}
          >
            Use this CV for application
          </button>
        )}
        <button
          className="primary"
          disabled={!checked || busy}
          onClick={() => void action("docx")}
        >
          <Download size={16} />
          Download original-format Word CV
        </button>
        <button disabled={!checked || busy} onClick={() => void action("txt")}>
          Download CV text
        </button>
      </div>
    </div>
  );
}
