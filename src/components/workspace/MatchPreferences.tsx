"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import {
  matchPreferencesSchema,
  matchPreferenceDefaults,
  type MatchPreferences as Preferences,
} from "@/lib/match-contracts";
import type { MatchSettings } from "./match-types";
import { api } from "./client";
export default function MatchPreferences({
  settings,
  onSaved,
  onCancel,
}: {
  settings: MatchSettings;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const defaults = {
    titles: settings.suggested.titles,
    skills: settings.suggested.skills,
    locations: settings.suggested.locations,
    arrangement: settings.suggested.arrangement === "remote" ? "remote" : "any",
    reviewed: true,
  };
  const [values, setValues] = useState<Preferences>(
    () =>
      settings.preferences ||
      ({ ...matchPreferenceDefaults, ...defaults } as Preferences),
  );
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reviewed, setReviewed] = useState(false);
  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }
  function list(
    key:
      | "titles"
      | "skills"
      | "locations"
      | "excluded"
      | "excludedCompanies"
      | "workAuthorization",
    label: string,
    hint?: string,
  ) {
    return (
      <label>
        {label}
        <input
          name={key}
          aria-label={label}
          aria-describedby={hint ? `match-hint-${key}` : undefined}
          defaultValue={(values[key] || []).join(", ")}
          onChange={(e) =>
            update(
              key,
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
        {hint && <small id={`match-hint-${key}`}>{hint}</small>}
      </label>
    );
  }
  function check(
    key:
      | "arrangementStrict"
      | "locationStrict"
      | "roleStrict"
      | "includeStretch"
      | "salaryStrict"
      | "allowUnknown"
      | "needsSponsorship"
      | "excludeNoSponsorship"
      | "relocation",
    label: string,
  ) {
    return (
      <label className="match-checkbox">
        <input
          type="checkbox"
          checked={values[key] || false}
          onChange={(e) => update(key, e.target.checked)}
        />
        <span>{label}</span>
      </label>
    );
  }
  async function save() {
    setError("");
    const parsed = matchPreferencesSchema.safeParse({
      ...values,
      reviewed: true,
    });
    if (!parsed.success || !reviewed) {
      setError(
        !reviewed
          ? "Confirm these preferences before saving."
          : "Add at least one target role or skill and check the fields.",
      );
      return;
    }
    setBusy(true);
    try {
      await api("matches/preferences", "POST", {
        values: parsed.data,
        expectedRevision: settings.revision,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const labels = ["Your direction", "Your boundaries", "Ready to discover"];
  return (
    <section className="match-setup" aria-labelledby="match-setup-title">
      <div className="match-section-heading">
        <div>
          <h2 id="match-setup-title">
            {settings.preferences
              ? "Refine your matches"
              : "Find work that fits you"}
          </h2>
          <p>Your CV provides context. You decide what matters.</p>
        </div>
        <button onClick={onCancel}>Close setup</button>
      </div>
      <ol className="match-setup-steps" aria-label="Matching setup">
        {labels.map((label, i) => (
          <li key={label} aria-current={step === i ? "step" : undefined}>
            {i < step ? <Check size={16} /> : <span>{i + 1}</span>}
            {label}
          </li>
        ))}
      </ol>
      <form
        key={step}
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 2) {
            setStep(step + 1);
            setError("");
          } else void save();
        }}
      >
        {step === 0 && (
          <>
            <h3>What should your next role look like?</h3>
            <div className="match-form-grid">
              {list(
                "titles",
                "Target roles",
                "Separate roles with commas, for example Android engineer, Kotlin developer.",
              )}
              {list(
                "skills",
                "Skills to emphasise",
                "Your saved CV also contributes skill mentions. Mentions are not verified proficiency.",
              )}
              {list(
                "locations",
                "Preferred locations",
                "Leave blank for worldwide. Remote jobs may still restrict your country.",
              )}
              <label>
                Work arrangement
                <select
                  value={values.arrangement || "any"}
                  onChange={(e) =>
                    update(
                      "arrangement",
                      e.target.value as Preferences["arrangement"],
                    )
                  }
                >
                  <option value="any">Any arrangement</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </label>
              <label>
                Experience level
                <select
                  value={values.seniority || "any"}
                  onChange={(e) =>
                    update(
                      "seniority",
                      e.target.value as Preferences["seniority"],
                    )
                  }
                >
                  {["any", "entry", "mid", "senior", "lead"].map((s) => (
                    <option key={s} value={s}>
                      {
                        (
                          {
                            any: "Any level",
                            entry: "Entry / graduate",
                            mid: "Mid-level",
                            senior: "Senior",
                            lead: "Lead / principal",
                          } as Record<string, string>
                        )[s]
                      }
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>Employment types</legend>
                {["full-time", "part-time", "contract", "internship"].map(
                  (t) => (
                    <label className="match-checkbox" key={t}>
                      <input
                        type="checkbox"
                        checked={
                          values.employmentTypes?.includes(t as "contract") ||
                          false
                        }
                        onChange={(e) =>
                          update(
                            "employmentTypes",
                            (e.target.checked
                              ? [...(values.employmentTypes || []), t]
                              : (values.employmentTypes || []).filter(
                                  (v) => v !== t,
                                )) as Preferences["employmentTypes"],
                          )
                        }
                      />
                      {t.replace("-", " ")}
                    </label>
                  ),
                )}
                <small>No selection means any type.</small>
              </fieldset>
            </div>
            {check(
              "includeStretch",
              "Include stretch roles above my selected experience level",
            )}
            <p className="match-context-note">
              {settings.hasCv
                ? "Your saved CV is available for matching."
                : "No saved CV text found. You can start with roles and skills."}{" "}
              <Link href="/profile">Manage CV and profile</Link>
            </p>
          </>
        )}
        {step === 1 && (
          <>
            <h3>Set your boundaries</h3>
            <p>
              Strict preferences filter listings. Everything else guides ranking
              or stays visible as context.
            </p>
            <div className="match-form-grid">
              <div>
                {check(
                  "roleStrict",
                  "Only show titles containing one of my target roles",
                )}
                {check(
                  "locationStrict",
                  "Treat preferred locations as a strict requirement",
                )}
                {check(
                  "arrangementStrict",
                  "Treat work arrangement as a strict requirement",
                )}
                {check(
                  "allowUnknown",
                  "Include jobs with missing structured details",
                )}
              </div>
              <div>
                {list("excludedCompanies", "Excluded employers")}
                {list(
                  "excluded",
                  "Excluded terms",
                  "Jobs mentioning these terms are filtered out. Use specific terms.",
                )}
              </div>
              <label>
                Minimum advertised salary
                <input
                  type="number"
                  min="0"
                  max="100000000"
                  value={values.salaryMinimum ?? ""}
                  onChange={(e) =>
                    update(
                      "salaryMinimum",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                />
              </label>
              <label>
                Salary currency
                <select
                  value={values.salaryCurrency || "USD"}
                  onChange={(e) =>
                    update(
                      "salaryCurrency",
                      e.target.value as Preferences["salaryCurrency"],
                    )
                  }
                >
                  {["USD", "SGD", "MYR", "GBP", "EUR", "CAD", "AUD", "INR"].map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Salary period
                <select
                  value={values.salaryPeriod || "year"}
                  onChange={(e) =>
                    update(
                      "salaryPeriod",
                      e.target.value as Preferences["salaryPeriod"],
                    )
                  }
                >
                  <option value="year">Per year</option>
                  <option value="month">Per month</option>
                  <option value="hour">Per hour</option>
                </select>
              </label>
              <div>
                {check(
                  "salaryStrict",
                  "Filter salaries below my minimum when comparable",
                )}
                <small>
                  We compare explicit matching currency and period only. Missing
                  or ambiguous pay follows the missing-details setting. No
                  currency conversion.
                </small>
              </div>
              {list(
                "workAuthorization",
                "Countries where I am authorised to work",
                "Saved as context. Location text does not establish eligibility.",
              )}
              <div>
                {check("needsSponsorship", "I need employer sponsorship")}
                {check(
                  "excludeNoSponsorship",
                  "Exclude listings explicitly saying they cannot sponsor",
                )}
                {check("relocation", "I am open to relocation")}
              </div>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h3>Your next opportunity, one decision at a time.</h3>
            <dl className="match-review">
              <div>
                <dt>Target roles</dt>
                <dd>{values.titles?.join(", ") || "Skills-led discovery"}</dd>
              </div>
              <div>
                <dt>Locations</dt>
                <dd>
                  {values.locations?.join(", ") || "Worldwide"}
                  {values.locationStrict ? " · Strict" : " · Preference"}
                </dd>
              </div>
              <div>
                <dt>Work arrangement</dt>
                <dd>{values.arrangement || "any"}</dd>
              </div>
              <div>
                <dt>Salary floor</dt>
                <dd>
                  {values.salaryMinimum
                    ? `${values.salaryCurrency || "USD"} ${values.salaryMinimum.toLocaleString()} / ${values.salaryPeriod || "year"}`
                    : "Not set"}
                </dd>
              </div>
            </dl>
            <p>
              Right swipe adds a job to your queue. Nothing is submitted. Left
              swipe passes this listing. You can undo either decision.
            </p>
            <p>
              Eligibility, sponsorship and qualifications still need checking
              against the employer’s requirements.
            </p>
            <label className="match-checkbox">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              These preferences reflect what I am looking for.
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="match-error">
            {error}
          </p>
        )}
        <div className="match-form-actions">
          {step > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          )}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Saving…" : step === 2 ? "Save and discover" : "Continue"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </section>
  );
}
