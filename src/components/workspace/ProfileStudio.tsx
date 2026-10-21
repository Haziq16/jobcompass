"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Plus, Upload, Check, FileText } from "lucide-react";
import { sections, type Fact } from "@/lib/assistant-contracts";
import { api, useResource } from "./client";
type Row = Omit<Fact, "reviewed"> & { reviewed: boolean };
export type AssistantMeta = {
  configuration: {
    configured: boolean;
    provider: string;
    model: string | null;
    maxOutputTokens: number;
    dailyLimit: number;
    inputRate: number | null;
    outputRate: number | null;
  };
  profile: { id: string; facts: Fact[] } | null;
  interview: { section: string; question: string }[];
  resumes: { id: string; name: string; isDefault: boolean; sha256: string }[];
};
export default function ProfileStudio() {
  const meta = useResource<AssistantMeta>("workspace/assistant");
  const loadedVersion = useRef<string | undefined>(undefined);
  const [facts, setFacts] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState("");
  useEffect(() => {
    if (
      meta.data &&
      loadedVersion.current !== (meta.data.profile?.id || "empty")
    ) {
      setFacts(meta.data.profile?.facts || []);
      loadedVersion.current = meta.data.profile?.id || "empty";
    }
  }, [meta.data]);
  function add(section: Fact["section"]) {
    setFacts((rows) => [
      ...rows,
      {
        id: crypto.randomUUID(),
        section,
        label: "",
        text: "",
        reviewed: false,
      },
    ]);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (facts.some((f) => !f.reviewed))
        throw new Error(
          "Review every fact before saving. Editing a fact clears its review check.",
        );
      await api("workspace/facts", "PUT", { facts });
      meta.refresh();
      setNotice(
        "Reviewed profile version saved. Existing drafts keep their original source version.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("Choose a PDF or DOCX under 4 MB.");
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/workspace/resumes", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreview(data.text);
      meta.refresh();
      setNotice(
        "Original stored unchanged. Review the extracted text and enter only confirmed facts below.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="upgrade-heading">
        <div>
          <span className="eyebrow">YOUR EXPERIENCE, IN YOUR WORDS</span>
          <h1>A profile you can stand behind.</h1>
          <p>
            Confirm facts once. Keep every generated claim connected to its
            source.
          </p>
        </div>
        <Link href="/settings">Matching &amp; budget settings</Link>
      </div>
      {(error || meta.error) && (
        <p role="alert" className="alert">
          {error || meta.error}
        </p>
      )}
      {notice && (
        <p role="status" className="success-note">
          {notice}
        </p>
      )}
      <div className="studio-grid">
        <section className="upgrade-panel">
          <h2>
            <FileText size={21} /> Your original résumés
          </h2>
          <p>
            Uploads are preserved as versions. Extracted text never becomes an
            AI fact without your review.
          </p>
          <label className="upload-button">
            <Upload size={16} /> Upload PDF or DOCX
            <input
              type="file"
              accept=".pdf,.docx"
              disabled={busy}
              onChange={(e) => {
                if (e.target.files?.[0]) void upload(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </label>
          {meta.data?.resumes.map((r) => (
            <div className="resume-row" key={r.id}>
              <span>
                {r.name}
                <small>
                  {r.isDefault ? "Default résumé" : "Stored original"}
                </small>
              </span>
              <a href={`/api/workspace/resumes/${r.id}/original`}>
                Download original
              </a>
              <button
                disabled={busy || r.isDefault}
                onClick={() => {
                  setBusy(true);
                  void api(`workspace/resumes/${r.id}`, "PATCH", {})
                    .then(meta.refresh)
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                {r.isDefault ? <Check size={16} /> : "Make default"}
              </button>
              <button
                onClick={() =>
                  void api<{ text: string }>(`workspace/resumes/${r.id}`)
                    .then((a) => setPreview(a.text))
                    .catch((e) => setError(e.message))
                }
              >
                Read extracted text
              </button>
            </div>
          ))}
          {preview && (
            <label className="field">
              Extracted text — review only
              <textarea readOnly rows={10} value={preview} />
            </label>
          )}
        </section>
        <aside className="upgrade-panel interview">
          <span className="eyebrow">A SHORT PROFILE INTERVIEW</span>
          <h2>Fill the useful gaps.</h2>
          <p>
            Skip anything you cannot verify. Unanswered authorization or
            experience questions stay unresolved.
          </p>
          {sections
            .filter((s) => !facts.some((f) => f.section === s && f.reviewed))
            .map((section) => (
              <div key={section}>
                <h3>{section}</h3>
                <p>
                  {section === "contact"
                    ? "Which name, email, phone and URLs should forms use? Use labels such as first name, last name, email, phone, linkedin or website."
                    : section === "answers"
                      ? "Add reviewed answers with the exact application question as the label."
                      : `What ${section} facts can you confirm? Include only verified dates, qualifications and metrics.`}
                </p>
                <button onClick={() => add(section)}>Add {section} fact</button>
              </div>
            ))}
        </aside>
      </div>
      <section className="upgrade-panel">
        <div className="panel-row">
          <div>
            <span className="eyebrow">REVIEWED KNOWLEDGE</span>
            <h2>Your profile facts</h2>
            <p>
              {meta.data?.profile
                ? `Source version ${meta.data.profile.id}`
                : "No reviewed version yet."}
            </p>
          </div>
          <button
            className="primary"
            disabled={busy || !facts.length}
            onClick={() => void save()}
          >
            Save reviewed version
          </button>
        </div>
        {facts.map((fact, index) => (
          <div className="fact-row" key={fact.id}>
            <label>
              Section
              <select
                value={fact.section}
                onChange={(e) =>
                  setFacts((rows) =>
                    rows.map((r, i) =>
                      i === index
                        ? {
                            ...r,
                            section: e.target.value as Fact["section"],
                            reviewed: false,
                          }
                        : r,
                    ),
                  )
                }
              >
                {sections.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Fact label
              <input
                value={fact.label}
                maxLength={120}
                onChange={(e) =>
                  setFacts((rows) =>
                    rows.map((r, i) =>
                      i === index
                        ? { ...r, label: e.target.value, reviewed: false }
                        : r,
                    ),
                  )
                }
              />
            </label>
            <label>
              Exact confirmed fact
              <textarea
                value={fact.text}
                maxLength={3000}
                rows={3}
                onChange={(e) =>
                  setFacts((rows) =>
                    rows.map((r, i) =>
                      i === index
                        ? { ...r, text: e.target.value, reviewed: false }
                        : r,
                    ),
                  )
                }
              />
            </label>
            <label className="checkline">
              <input
                type="checkbox"
                checked={fact.reviewed}
                onChange={(e) =>
                  setFacts((rows) =>
                    rows.map((r, i) =>
                      i === index ? { ...r, reviewed: e.target.checked } : r,
                    ),
                  )
                }
              />{" "}
              I confirm this fact
            </label>
            <button
              onClick={() =>
                setFacts((rows) => rows.filter((_, i) => i !== index))
              }
            >
              Remove
            </button>
          </div>
        ))}
        <div className="card-actions">
          {sections.map((s) => (
            <button key={s} onClick={() => add(s)}>
              <Plus size={14} />
              {s}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
