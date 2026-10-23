"use client";
import { useState } from "react";
import { Upload, Plus, Trash2, Check, ArrowRight } from "lucide-react";
import {
  candidateSections,
  sectionLabels,
  candidateValuesSchema,
  type CandidateValues,
  type CandidateSection,
} from "@/lib/application-memory-contracts";
import type { CandidateResult, cvSuggestions } from "@/lib/application-memory";
import { api } from "./client";
type Suggestions = ReturnType<typeof cvSuggestions>;
const sectionHelp: Record<CandidateSection, string> = {
  contact: "Use the contact details employers should receive.",
  experience: "Include only roles, dates and responsibilities you can confirm.",
  education: "Keep institutions, qualifications and dates accurate.",
  projects: "Describe your own contribution. Add public links when useful.",
  skills: "List skills you are comfortable discussing in an interview.",
  eligibility:
    "Record each country separately. These are your declarations, not a legal eligibility check.",
  preferences:
    "These answers change over time. Confirm them again when your circumstances change.",
};
function Fields({
  value,
  fields,
  onChange,
}: {
  value: Record<string, string>;
  fields: { key: string; label: string; type?: string; hint?: string }[];
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="candidate-fields">
      {fields.map((f) => (
        <label key={f.key}>
          <span>{f.label}</span>
          {f.type === "textarea" ? (
            <textarea
              aria-label={f.label}
              rows={4}
              value={value[f.key] || ""}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          ) : (
            <input
              aria-label={f.label}
              type={f.type || "text"}
              value={value[f.key] || ""}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          )}
          {f.hint && <small>{f.hint}</small>}
        </label>
      ))}
    </div>
  );
}
export default function CandidateEditor({
  data,
  onSaved,
  onNotice,
}: {
  data: CandidateResult;
  onSaved: () => void;
  onNotice: (text: string) => void;
}) {
  const [values, setValues] = useState<CandidateValues>(() =>
      structuredClone(data.values),
    ),
    [active, setActive] = useState<CandidateSection>("contact"),
    [confirm, setConfirm] = useState<CandidateSection[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const changed = (s: CandidateSection) =>
    JSON.stringify(values[s]) !== JSON.stringify(data.values[s]) ||
    values.nothingToDeclare.includes(s as "skills") !==
      data.values.nothingToDeclare.includes(s as "skills");
  function update<K extends keyof CandidateValues>(
    key: K,
    value: CandidateValues[K],
  ) {
    setValues((v) => ({
      ...v,
      [key]: value,
      ...(["experience", "education", "projects", "skills"].includes(key) &&
      Array.isArray(value) &&
      value.length
        ? { nothingToDeclare: v.nothingToDeclare.filter((s) => s !== key) }
        : {}),
    }));
    setConfirm((v) =>
      key === "nothingToDeclare" ? [] : v.filter((s) => s !== key),
    );
    setError("");
  }
  function rowField(
    section: "experience" | "education" | "projects",
    id: string,
    key: string,
    value: string,
  ) {
    update(
      section,
      values[section].map((r) =>
        r.id === id ? { ...r, [key]: value } : r,
      ) as never,
    );
  }
  function add(section: "experience" | "education" | "projects") {
    const row =
      section === "experience"
        ? {
            id: crypto.randomUUID(),
            employer: "",
            title: "",
            start: "",
            end: "",
            summary: "",
          }
        : section === "education"
          ? {
              id: crypto.randomUUID(),
              institution: "",
              qualification: "",
              start: "",
              end: "",
              details: "",
            }
          : { id: crypto.randomUUID(), name: "", url: "", summary: "" };
    update(section, [...values[section], row] as never);
    if (values.nothingToDeclare.includes(section))
      setValues((v) => ({
        ...v,
        nothingToDeclare: v.nothingToDeclare.filter((s) => s !== section),
      }));
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      candidateValuesSchema.parse(values);
      await api("application-profile/profile", "POST", {
        values,
        expectedRevision: data.revision,
        confirmSections: confirm,
      });
      onNotice(
        confirm.length
          ? "Profile saved. Checked sections are confirmed; future edits will require confirmation again."
          : "Draft saved. Unconfirmed sections will not supply answers.",
      );
      onSaved();
    } catch (e) {
      const message = (e as Error).message;
      setError(
        message === "revision_conflict"
          ? "Your profile changed in another tab. Keep this draft, then reload before saving."
          : message === "profile_section_incomplete"
            ? "Complete this section or explicitly state there is nothing to include before confirming it."
            : "Could not save. Check emails, URLs, dates and required fields. Your draft is still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function importCv(file?: File) {
    setBusy(true);
    setError("");
    try {
      let result: Suggestions;
      if (file) {
        if (file.size > 5 * 1024 * 1024)
          throw new Error("Choose a CV under 5 MB.");
        const form = new FormData();
        form.set("file", file);
        const r = await fetch("/api/application-profile/import", {
          method: "POST",
          body: form,
        });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        result = body;
      } else
        result = await api<Suggestions>(
          "application-profile/import-existing",
          "POST",
          {},
        );
      setSuggestions(result);
    } catch (e) {
      setError(
        (e as Error).message === "cv_source_missing"
          ? "No saved CV is available yet. Upload a PDF or DOCX."
          : "Could not read this CV. Choose a valid PDF or DOCX under 5 MB; your draft is unchanged.",
      );
    } finally {
      setBusy(false);
    }
  }
  function useSuggestions() {
    if (!suggestions) return;
    setValues((v) => {
      const next = structuredClone(v);
      for (const key of Object.keys(
        next.contact,
      ) as (keyof CandidateValues["contact"])[])
        if (!next.contact[key])
          next.contact[key] = suggestions.contact[key] || "";
      if (!next.skills.length) next.skills = suggestions.skills;
      for (const block of suggestions.blocks) {
        if (block.section === "experience" && !next.experience.length)
          next.experience.push({
            id: crypto.randomUUID(),
            employer: "",
            title: "",
            start: "",
            end: "",
            summary: block.text,
          });
        if (block.section === "education" && !next.education.length)
          next.education.push({
            id: crypto.randomUUID(),
            institution: "",
            qualification: "",
            start: "",
            end: "",
            details: block.text.slice(0, 3000),
          });
        if (block.section === "projects" && !next.projects.length)
          next.projects.push({
            id: crypto.randomUUID(),
            name: "",
            url: "",
            summary: block.text,
          });
      }
      next.nothingToDeclare = next.nothingToDeclare.filter(
        (s) => !next[s].length,
      );
      next.cvSource = suggestions.cvSource;
      return next;
    });
    setConfirm([]);
    setSuggestions(null);
    onNotice(
      "Suggestions added to empty fields only. Review the draft before confirming any section.",
    );
  }
  const confirmed =
    data.sections.find((s) => s.section === active)?.confirmed &&
    !changed(active);
  return (
    <div className="candidate-editor">
      <aside className="candidate-section-nav">
        <h2>Your information</h2>
        {candidateSections.map((section) => (
          <button
            key={section}
            aria-current={active === section ? "step" : undefined}
            onClick={() => setActive(section)}
          >
            <span>{sectionLabels[section]}</span>
            {data.sections.find((s) => s.section === section)?.confirmed &&
            !changed(section) ? (
              <Check size={16} />
            ) : (
              <span className="candidate-status">Draft</span>
            )}
          </button>
        ))}
        <p>
          Confirmation means you checked the facts. It is not an employer
          verification.
        </p>
      </aside>
      <div className="candidate-main">
        <section className="candidate-cv">
          <div>
            <h2>Start with your CV</h2>
            <p>
              Extract suggestions without rewriting or changing the original.
            </p>
          </div>
          <div className="candidate-inline-actions">
            <label className="candidate-upload">
              <Upload size={16} />
              Upload CV
              <input
                type="file"
                accept=".pdf,.docx"
                disabled={busy}
                onChange={(e) => {
                  if (e.target.files?.[0]) void importCv(e.target.files[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {data.hasSavedCv && (
              <button disabled={busy} onClick={() => void importCv()}>
                Use saved CV
              </button>
            )}
          </div>
        </section>
        {suggestions && (
          <section className="candidate-import-review">
            <h3>Review extracted suggestions</h3>
            <p>{suggestions.warning}</p>
            <p>
              {[
                suggestions.contact.name,
                suggestions.contact.email,
                suggestions.contact.phone,
              ]
                .filter(Boolean)
                .join(" · ") || "No contact suggestions found."}
            </p>
            <p>
              {suggestions.skills.length} skill mentions ·{" "}
              {suggestions.blocks.length} source sections
            </p>
            <details>
              <summary>Read extracted source text</summary>
              <pre>{suggestions.extractedText}</pre>
            </details>
            <div className="candidate-inline-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={useSuggestions}
              >
                Add to empty draft fields
              </button>
              <button onClick={() => setSuggestions(null)}>
                Discard suggestions
              </button>
            </div>
          </section>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <header className="candidate-section-header">
            <div>
              <h2>{sectionLabels[active]}</h2>
              <p>{sectionHelp[active]}</p>
            </div>
            <span
              className={confirmed ? "candidate-confirmed" : "candidate-status"}
            >
              {confirmed ? "Confirmed" : "Needs confirmation"}
            </span>
          </header>
          {active === "contact" && (
            <Fields
              value={values.contact}
              onChange={(k, v) =>
                update("contact", { ...values.contact, [k]: v })
              }
              fields={[
                { key: "name", label: "Full name" },
                {
                  key: "firstName",
                  label: "Given / first name",
                  hint: "Confirm explicitly; we never split your full name automatically.",
                },
                { key: "lastName", label: "Family / last name" },
                { key: "email", label: "Application email", type: "email" },
                { key: "phone", label: "Phone number", type: "tel" },
                { key: "location", label: "Current location" },
                { key: "linkedin", label: "LinkedIn URL", type: "url" },
                {
                  key: "portfolio",
                  label: "Portfolio or website URL",
                  type: "url",
                },
              ]}
            />
          )}
          {(["experience", "education", "projects"] as const)
            .filter((s) => s === active)
            .map((section) => (
              <div key={section}>
                {values[section].map((row, index) => (
                  <fieldset className="candidate-entry" key={row.id}>
                    <legend>
                      {sectionLabels[section]} {index + 1}
                    </legend>
                    <Fields
                      value={row}
                      onChange={(k, v) => rowField(section, row.id, k, v)}
                      fields={
                        section === "experience"
                          ? [
                              { key: "employer", label: "Employer" },
                              { key: "title", label: "Job title" },
                              {
                                key: "start",
                                label: "Start date",
                                hint: "YYYY or YYYY-MM",
                              },
                              {
                                key: "end",
                                label: "End date",
                                hint: "Use Present for a current role",
                              },
                              {
                                key: "summary",
                                label: "Responsibilities and achievements",
                                type: "textarea",
                              },
                            ]
                          : section === "education"
                            ? [
                                { key: "institution", label: "Institution" },
                                {
                                  key: "qualification",
                                  label: "Qualification",
                                },
                                { key: "start", label: "Start date" },
                                { key: "end", label: "End date" },
                                {
                                  key: "details",
                                  label: "Education details",
                                  type: "textarea",
                                },
                              ]
                            : [
                                { key: "name", label: "Project name" },
                                {
                                  key: "url",
                                  label: "Project URL",
                                  type: "url",
                                },
                                {
                                  key: "summary",
                                  label: "Your contribution",
                                  type: "textarea",
                                },
                              ]
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        update(
                          section,
                          values[section].filter(
                            (r) => r.id !== row.id,
                          ) as never,
                        )
                      }
                    >
                      <Trash2 size={15} />
                      Remove entry
                    </button>
                  </fieldset>
                ))}
                <button type="button" onClick={() => add(section)}>
                  <Plus size={16} />
                  Add{" "}
                  {section === "experience"
                    ? "experience"
                    : section === "education"
                      ? "education"
                      : "project"}
                </button>
              </div>
            ))}
          {active === "skills" && (
            <label>
              Skills you can discuss
              <textarea
                aria-label="Skills you can discuss"
                rows={5}
                defaultValue={values.skills.join(", ")}
                onChange={(e) =>
                  update(
                    "skills",
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
              />
              <small>
                Separate skills with commas. CV keyword extraction does not
                verify proficiency.
              </small>
            </label>
          )}
          {["experience", "education", "projects", "skills"].includes(
            active,
          ) && (
            <label className="candidate-checkbox">
              <input
                type="checkbox"
                checked={values.nothingToDeclare.includes(active as "skills")}
                disabled={(values[active] as unknown[]).length > 0}
                onChange={(e) =>
                  update(
                    "nothingToDeclare",
                    e.target.checked
                      ? [...values.nothingToDeclare, active as "skills"]
                      : values.nothingToDeclare.filter((s) => s !== active),
                  )
                }
              />
              I have no {active} to include.
            </label>
          )}
          {active === "eligibility" && (
            <>
              {values.eligibility.map((row, index) => (
                <fieldset className="candidate-entry" key={row.id}>
                  <legend>Country {index + 1}</legend>
                  <Fields
                    value={row}
                    fields={[
                      { key: "country", label: "Country" },
                      {
                        key: "details",
                        label: "Authorization details",
                        type: "textarea",
                      },
                      {
                        key: "expiresOn",
                        label: "Authorization expiry",
                        type: "date",
                      },
                    ]}
                    onChange={(k, v) =>
                      update(
                        "eligibility",
                        values.eligibility.map((r) =>
                          r.id === row.id ? { ...r, [k]: v } : r,
                        ),
                      )
                    }
                  />
                  <div className="candidate-fields">
                    <label>
                      Current work authorization
                      <select
                        aria-label="Current work authorization"
                        value={row.status}
                        onChange={(e) =>
                          update(
                            "eligibility",
                            values.eligibility.map((r) =>
                              r.id === row.id
                                ? {
                                    ...r,
                                    status: e.target.value as typeof row.status,
                                  }
                                : r,
                            ),
                          )
                        }
                      >
                        <option value="unknown">Not yet confirmed</option>
                        <option value="citizen">Citizen</option>
                        <option value="permanent_resident">
                          Permanent resident
                        </option>
                        <option value="work_visa">
                          Valid work visa / permission
                        </option>
                        <option value="not_authorized">
                          Not currently authorized
                        </option>
                      </select>
                    </label>
                    <label>
                      Need sponsorship now or in the future?
                      <select
                        aria-label="Need sponsorship now or in the future?"
                        value={row.needsSponsorship}
                        onChange={(e) =>
                          update(
                            "eligibility",
                            values.eligibility.map((r) =>
                              r.id === row.id
                                ? {
                                    ...r,
                                    needsSponsorship: e.target
                                      .value as typeof row.needsSponsorship,
                                  }
                                : r,
                            ),
                          )
                        }
                      >
                        <option value="unknown">Not yet confirmed</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      update(
                        "eligibility",
                        values.eligibility.filter((r) => r.id !== row.id),
                      )
                    }
                  >
                    Remove country
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                onClick={() =>
                  update("eligibility", [
                    ...values.eligibility,
                    {
                      id: crypto.randomUUID(),
                      country: "",
                      status: "unknown",
                      needsSponsorship: "unknown",
                      details: "",
                      expiresOn: "",
                    },
                  ])
                }
              >
                <Plus size={16} />
                Add country
              </button>
            </>
          )}
          {active === "preferences" && (
            <>
              <Fields
                value={values.preferences}
                fields={[
                  {
                    key: "availability",
                    label: "When can you start?",
                    hint: "For example, 1 December 2026 or two weeks after accepting an offer",
                  },
                  { key: "noticePeriod", label: "Notice period" },
                  {
                    key: "salaryAnswer",
                    label: "Expected salary answer",
                    hint: "Include currency and period, for example SGD 90,000–110,000 per year",
                  },
                  {
                    key: "salaryCountry",
                    label: "Country for this salary expectation",
                  },
                ]}
                onChange={(k, v) =>
                  update("preferences", { ...values.preferences, [k]: v })
                }
              />
              <label>
                Open to relocation?
                <select
                  aria-label="Open to relocation?"
                  value={values.preferences.relocation}
                  onChange={(e) =>
                    update("preferences", {
                      ...values.preferences,
                      relocation: e.target
                        .value as CandidateValues["preferences"]["relocation"],
                    })
                  }
                >
                  <option value="unknown">Not yet decided</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <p className="candidate-help">
                Availability answers need reconfirmation after 7 days, salary
                after 30 days, and work authorization/sponsorship after 90 days
                at most.
              </p>
            </>
          )}
          {error && (
            <p className="candidate-error" role="alert">
              {error}
            </p>
          )}
          <div className="candidate-confirmation">
            <label className="candidate-checkbox">
              <input
                type="checkbox"
                checked={confirm.includes(active)}
                onChange={(e) =>
                  setConfirm((v) =>
                    e.target.checked
                      ? [...v, active]
                      : v.filter((s) => s !== active),
                  )
                }
              />
              I checked this section and confirm the information is accurate.
            </label>
            <p>
              Edits invalidate confirmation. Drafts remain private and will not
              automatically supply answers.
            </p>
          </div>
          <footer className="candidate-form-footer">
            <span>
              {confirm.length} section{confirm.length === 1 ? "" : "s"} selected
              for confirmation
            </span>
            <button className="primary" type="submit" disabled={busy}>
              {busy
                ? "Saving…"
                : confirm.length
                  ? "Save and confirm"
                  : "Save draft"}
            </button>
            {active !== "preferences" && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setActive(
                    candidateSections[candidateSections.indexOf(active) + 1],
                  )
                }
              >
                Next section
                <ArrowRight size={16} />
              </button>
            )}
          </footer>
        </form>
      </div>
    </div>
  );
}
