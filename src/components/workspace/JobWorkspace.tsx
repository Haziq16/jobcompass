"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api, useResource } from "./client";
import MatchPreferences from "./MatchPreferences";
import type { MatchSettings } from "./match-types";
import type { jobWorkspace } from "@/lib/job-workspace";
import { applicationTaskLabel } from "@/lib/application-progress";

type Data = Awaited<ReturnType<typeof jobWorkspace>>;
const tabs = [
  ["matching", "Matching jobs"],
  ["queued", "Queue"],
  ["applied", "Applied"],
  ["interviews", "Interviews"],
  ["offers", "Offers"],
  ["saved", "Saved"],
  ["passed", "Skipped"],
  ["attention", "Needs attention"],
] as const;
export default function JobWorkspace() {
  const router = useRouter(),
    params = useSearchParams();
  const tab = params.get("tab") || "matching";
  const query = new URLSearchParams({
    tab,
    page: params.get("page") || "1",
    q: params.get("q") || "",
  });
  const resource = useResource<Data>(`job-workspace?${query}`);
  const refresh = resource.refresh;
  const [search, setSearch] = useState(params.get("q") || ""),
    [preferences, setPreferences] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const request = useRef<{ key: string; id: string } | null>(null);
  const data = resource.data;
  const selected =
    data?.rows.find((row) => row.id === params.get("selected")) ||
    data?.rows[0];
  function navigate(values: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(values))
      if (value === null) next.delete(key);
      else next.set(key, value);
    router.push(`/my-jobs?${next}`, { scroll: false });
  }
  useEffect(() => {
    if (!["queued", "attention"].includes(tab)) return;
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [tab, refresh]);
  async function decide(state: "queued" | "saved" | "passed") {
    if (!selected?.match || busy) return;
    const job = selected.match,
      key = `${job.id}:${state}`;
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ processing?: { enqueued: boolean } }>(
        "matches/decision",
        "POST",
        {
          requestId: request.current.id,
          catalogId: job.id,
          state,
          reason: null,
          expectedRevision: job.decisionRevision,
          ...(state === "queued" && job.applicationConsent
            ? { applicationConsent: job.applicationConsent.token }
            : {}),
        },
      );
      setNotice(
        state === "queued"
          ? result.processing?.enqueued
            ? "Application authorized and queued. Track its actual progress in Queue."
            : "Added to Queue. Preparation or approval is still required before automatic processing."
          : state === "saved"
            ? "Saved for later."
            : "Skipped. You can find this job in Skipped.",
      );
      request.current = null;
      refresh();
    } catch (e) {
      setError(
        (e as Error).message === "application_consent_stale"
          ? "Your profile, CV or rules changed. Refresh the list before authorizing this employer."
          : "Could not confirm this change. Refresh to check the saved state before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (preferences && data?.settings)
    return (
      <MatchPreferences
        settings={data.settings as unknown as MatchSettings}
        onSaved={() => {
          setPreferences(false);
          refresh();
        }}
        onCancel={() => setPreferences(false)}
      />
    );
  return (
    <div className="job-workspace">
      <header className="job-workspace-heading">
        <div>
          <h1>My jobs</h1>
          <p>
            Your matches, application documents and next steps in one place.
          </p>
        </div>
        <div className="job-workspace-tools">
          {data?.matchingAvailable ? (
            <>
              <Link href="/discover?view=swipe">Swipe jobs</Link>
              <Link href="/automation">Application rules</Link>
              <button
                onClick={() => setPreferences(true)}
                disabled={!data.settings}
              >
                <SlidersHorizontal size={16} /> Preferences
              </button>
            </>
          ) : (
            <Link href="/discover">Discover jobs</Link>
          )}
        </div>
      </header>
      <nav className="job-workspace-tabs" aria-label="Job stages">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            href={`/my-jobs?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
          >
            {label}
            {data && key !== "matching" && <span>{data.counts[key]}</span>}
          </Link>
        ))}
      </nav>
      <form
        className="job-workspace-search"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ q: search, page: "1", selected: null });
        }}
      >
        <label htmlFor="my-jobs-query">Search matching jobs</label>
        <div>
          <Search size={17} />
          <input
            id="my-jobs-query"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Role, skill or company"
            disabled={tab !== "matching" || !data?.matchingAvailable}
          />
          <button disabled={tab !== "matching" || !data?.matchingAvailable}>
            Search
          </button>
        </div>
        {tab !== "matching" && (
          <small>Choose Matching jobs to search the catalogue.</small>
        )}
      </form>
      {(error || resource.error) && (
        <div role="alert" className="job-workspace-message">
          {error || "Your jobs could not be loaded."}
          <button onClick={refresh}>Refresh</button>
        </div>
      )}
      {notice && (
        <p role="status" className="job-workspace-message">
          {notice}
        </p>
      )}
      {resource.loading && !data && <p role="status">Loading your jobs…</p>}
      {data && tab === "matching" && !data.settings?.preferences && (
        <section className="job-workspace-empty">
          <h2>
            {data.matchingAvailable
              ? "Tell JobCompass what you’re looking for"
              : "Find your next opportunity"}
          </h2>
          <p>
            {data.matchingAvailable
              ? "Choose roles, skills, locations and requirements to create your matching feed."
              : "Browse employer listings, save a private shortlist and track your applications here. Swipe matching is currently an owner preview."}
          </p>
          {data.matchingAvailable ? (
            <button onClick={() => setPreferences(true)}>
              Set job preferences
            </button>
          ) : (
            <Link href="/discover">Browse the worldwide catalogue</Link>
          )}
        </section>
      )}
      {data && (tab !== "matching" || data.settings?.preferences) && (
        <>
          <p className="job-workspace-count">
            {data.total.toLocaleString()}{" "}
            {tab === "matching" ? "matching opportunities" : "jobs"}
            {tab === "matching" &&
              " · Based on your CV, preferences and explicit feedback"}
          </p>
          {!data.rows.length ? (
            <section className="job-workspace-empty">
              <h2>
                {tab === "attention"
                  ? "No applications need attention"
                  : "No jobs here yet"}
              </h2>
              <p>
                {tab === "matching"
                  ? "Try broader preferences or a different search. Your requirements remain yours to control."
                  : "Jobs appear here as you save them, apply and record outcomes."}
              </p>
              <Link href="/my-jobs">Find matching jobs</Link>
            </section>
          ) : (
            <div className="job-workspace-split">
              <section className="job-workspace-list" aria-label="Jobs">
                {data.rows.map((row) => (
                  <button
                    key={row.id}
                    className="job-workspace-row"
                    aria-pressed={selected?.id === row.id}
                    onClick={() => navigate({ selected: row.id })}
                  >
                    <span className="job-workspace-employer">
                      {row.employer}
                    </span>
                    <strong>{row.title}</strong>
                    <span>{row.location || "Location not specified"}</span>
                    <small>
                      {row.match?.recommendation.label ||
                        applicationTaskLabel(row.status)}
                    </small>
                  </button>
                ))}
              </section>
              {selected && (
                <section
                  className="job-workspace-detail"
                  aria-label="Selected job"
                >
                  <header>
                    <p>{selected.employer}</p>
                    <h2>{selected.title}</h2>
                    <p>{selected.location || "Location not specified"}</p>
                    {selected.match?.salaryText && (
                      <p>{selected.match.salaryText}</p>
                    )}
                  </header>
                  {selected.match && (
                    <>
                      <section>
                        <h3>Why this job</h3>
                        <ul>
                          {selected.match.recommendation.reasons.map(
                            (reason) => (
                              <li key={reason}>{reason}</li>
                            ),
                          )}
                        </ul>
                        <p className="job-workspace-status">
                          {selected.match.readiness?.label}
                        </p>
                        {selected.match.readiness?.reasons.map((reason) => (
                          <p key={reason}>{reason}</p>
                        ))}
                      </section>
                      <section>
                        <h3>Skills in this role</h3>
                        <div className="job-workspace-skills">
                          {selected.match.recommendation.skills.map((skill) => (
                            <span key={skill}>
                              <Check size={13} />
                              {skill}
                            </span>
                          ))}
                          {selected.match.otherSkills.map((skill) => (
                            <span key={skill}>{skill}</span>
                          ))}
                        </div>
                        <p>
                          Skill mentions guide preparation; they do not certify
                          proficiency.
                        </p>
                      </section>
                    </>
                  )}
                  {selected.detail && (
                    <p className="job-workspace-message">{selected.detail}</p>
                  )}
                  <div className="job-workspace-actions">
                    <Link
                      className="job-workspace-primary"
                      href={`/prepare?source=${selected.source}&jobId=${encodeURIComponent(selected.id)}`}
                    >
                      Prepare application <ArrowRight size={16} />
                    </Link>
                    {selected.source === "catalog" && tab !== "matching" && (
                      <Link href={`/apply/${selected.id}`}>
                        Open application & recovery
                      </Link>
                    )}
                    {selected.applicationId && (
                      <Link href={`/applications/${selected.applicationId}`}>
                        Application timeline
                      </Link>
                    )}
                  </div>
                  {selected.match && (
                    <section className="job-workspace-decision">
                      {selected.match.applicationConsent && (
                        <p>
                          Authorize sending{" "}
                          <strong>
                            {selected.match.applicationConsent.cvName}
                          </strong>{" "}
                          and your confirmed contact details and answers to{" "}
                          <strong>{selected.employer}</strong> for this role.{" "}
                          {selected.match.applicationConsent.submit
                            ? "Submit when all required checks pass."
                            : "Fill only; do not submit."}
                        </p>
                      )}
                      <div>
                        <button
                          onClick={() => decide("passed")}
                          disabled={busy}
                        >
                          <X size={16} /> Skip
                        </button>
                        <button onClick={() => decide("saved")} disabled={busy}>
                          <Bookmark size={16} /> Save
                        </button>
                        <button
                          onClick={() => decide("queued")}
                          disabled={busy}
                        >
                          {busy
                            ? "Saving…"
                            : selected.match.applicationConsent
                              ? selected.match.applicationConsent.submit
                                ? "Authorize & apply"
                                : "Authorize & fill"
                              : "Add to queue"}
                        </button>
                      </div>
                    </section>
                  )}
                  {selected.description && (
                    <section>
                      <h3>About this role</h3>
                      <p className="job-workspace-description">
                        {selected.description}
                      </p>
                    </section>
                  )}
                  {selected.applyUrl && (
                    <a
                      href={selected.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View original employer posting
                    </a>
                  )}
                </section>
              )}
            </div>
          )}
          <nav className="job-workspace-pagination" aria-label="Job pages">
            <button
              disabled={data.page === 1 || resource.loading}
              onClick={() =>
                navigate({ page: String(data.page - 1), selected: null })
              }
            >
              <ArrowLeft size={16} /> Previous
            </button>
            <span>Page {data.page}</span>
            <button
              disabled={
                data.page * data.pageSize >= data.total || resource.loading
              }
              onClick={() =>
                navigate({ page: String(data.page + 1), selected: null })
              }
            >
              Next <ArrowRight size={16} />
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
