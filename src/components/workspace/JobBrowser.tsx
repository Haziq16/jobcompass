"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Bookmark,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Expand,
  RotateCcw,
} from "lucide-react";
import { api, useResource } from "./client";
import type { Job as BaseJob } from "../classic/common";
import JobDetail from "../classic/JobDetail";
import UrlTextField from "./UrlTextField";
type Job = BaseJob & {
  skippedAt: string | null;
  seniority: string | null;
  industry: string | null;
  workArrangement: string | null;
  metadataProvenance: Record<string, string>;
  application: (BaseJob["application"] & { id?: string }) | null;
};
type Result = { jobs: Job[]; total: number; pages: number; page: number };
export default function JobBrowser({ saved = false }: { saved?: boolean }) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const url = params.toString();
  const view = params.get("view") || "board",
    selectedId = params.get("job"),
    isSkipped = view === "skipped";
  const query = new URLSearchParams(url);
  query.delete("job");
  query.delete("view");
  query.delete("expanded");
  query.set("skipped", String(isSkipped));
  if (saved) query.set("saved", "true");
  const result = useResource<Result>(`jobs?${query}`),
    facets = useResource<Record<string, string[]>>("workspace/facets");
  const [selected, setSelected] = useState<Job | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  function change(values: Record<string, string | null>, reset = true) {
    const next = new URLSearchParams(url);
    if (reset) next.delete("page");
    for (const [k, v] of Object.entries(values)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`${pathname}?${next}`, { scroll: false });
  }
  useEffect(() => {
    let current = true;
    if (!selectedId) {
      setSelected(null);
      return;
    }
    api<Job>(`jobs/${selectedId}`)
      .then((j) => {
        if (current) setSelected(j);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [selectedId, result.data]);
  const jobs = result.data?.jobs || [],
    active = selected || jobs[0];
  async function mutate(job: Job, patch: object) {
    setBusy(true);
    setError("");
    try {
      await api(`jobs/${job.id}`, "PATCH", patch);
      result.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function prepare(job: Job) {
    setBusy(true);
    try {
      const app = await api<{ id: string }>(
        `workspace/prepare/${job.id}`,
        "POST",
        {},
      );
      router.push(`/applications/${app.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const cardAction = useRef({ active, busy, mutate, change });
  cardAction.current = { active, busy, mutate, change };
  useEffect(() => {
    if (view !== "quick") return;
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input,textarea,select,button,a,[contenteditable]")
      )
        return;
      const a = cardAction.current;
      if (!a.active || a.busy) return;
      if (e.key === "s") {
        e.preventDefault();
        void a.mutate(a.active, { saved: !a.active.saved });
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        void a.mutate(a.active, { skipped: true });
        a.change({ job: null });
      }
      if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        a.change({ job: a.active.id, expanded: "true" }, false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view]);
  const expanded = params.get("expanded") === "true";
  const showDetail = (job: Job) => (
    <JobDetail
      key={job.id}
      job={job}
      demo={false}
      close={() => {
        change({ job: null, expanded: null }, false);
        heading.current?.focus();
      }}
      onUpdate={(d) => mutate(job, d)}
      onTrack={async (d) => {
        await api(`applications/${job.id}`, "PATCH", d);
        result.refresh();
      }}
    />
  );
  return (
    <>
      <div className="upgrade-heading">
        <div>
          <span className="eyebrow">YOUR OPPORTUNITIES</span>
          <h1 ref={heading} tabIndex={-1}>
            {saved ? "Saved jobs" : "My jobs"}
          </h1>
          <p>
            {saved
              ? "Your shortlist, ready for the next step."
              : "All your imported opportunities, in one place."}
          </p>
        </div>
        <Link href="/discover" className="primary">
          Discover new jobs <ArrowRight size={16} />
        </Link>
      </div>
      <section className="upgrade-filters" aria-label="Stored job filters">
        <UrlTextField
          label="Search stored jobs"
          value={params.get("q") || ""}
          onCommit={(q) => change({ q, job: null })}
          placeholder="Role, company or notes"
        />
        <UrlTextField
          label="Country"
          value={params.get("country") || ""}
          onCommit={(country) =>
            change({ country: country.toLowerCase(), job: null })
          }
          placeholder="Two-letter code"
          maxLength={2}
        />
        <label>
          Match
          <select
            value={params.get("min") || "0"}
            onChange={(e) => change({ min: e.target.value })}
          >
            <option value="0">All matches</option>
            <option value="50">50% or higher</option>
            <option value="75">75% or higher</option>
          </select>
        </label>
        <label>
          Sort
          <select
            value={params.get("sort") || "recent"}
            onChange={(e) => change({ sort: e.target.value })}
          >
            <option value="recent">Recently fetched</option>
            <option value="published">Recently posted</option>
            <option value="match">Profile match</option>
          </select>
        </label>
        <details>
          <summary>More filters</summary>
          <div className="filter-options">
            {[
              "employmentType",
              "seniority",
              "workArrangement",
              "industry",
              "employer",
            ].map((field) => (
              <div key={field}>
                <label>
                  {
                    (
                      {
                        employmentType: "Employment type",
                        seniority: "Seniority",
                        workArrangement: "Work arrangement",
                        industry: "Industry",
                        employer: "Company",
                      } as Record<string, string>
                    )[field]
                  }
                  <select
                    value={params.get(field) || ""}
                    onChange={(e) =>
                      change({ [field]: e.target.value, job: null })
                    }
                  >
                    <option value="">Any</option>
                    {(facets.data?.[field] || []).map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                    <option value="__unknown">Unknown only</option>
                  </select>
                </label>
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={params.get(`unknown_${field}`) === "true"}
                    onChange={(e) =>
                      change({
                        [`unknown_${field}`]: e.target.checked ? "true" : null,
                      })
                    }
                  />{" "}
                  Include unknown
                </label>
              </div>
            ))}
            <div>
              <label>
                Posted within
                <select
                  value={params.get("age") || ""}
                  onChange={(e) => change({ age: e.target.value })}
                >
                  <option value="">Any time</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                </select>
              </label>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={params.get("unknown_age") === "true"}
                  onChange={(e) =>
                    change({ unknown_age: e.target.checked ? "true" : null })
                  }
                />{" "}
                Include unknown dates
              </label>
            </div>
            <UrlTextField
              label="Minimum advertised salary"
              type="number"
              value={
                params.get("salary") === "unknown"
                  ? ""
                  : params.get("salary") || ""
              }
              onCommit={(salary) => change({ salary })}
            />
            {["currency", "period"].map((name) => (
              <label key={name}>
                Salary {name}
                <select
                  value={params.get(name) || ""}
                  onChange={(e) => change({ [name]: e.target.value })}
                >
                  <option value="">Select {name}</option>
                  {(
                    facets.data?.[
                      name === "currency" ? "salaryCurrency" : "salaryPeriod"
                    ] || []
                  ).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            ))}
            <label className="checkline">
              <input
                type="checkbox"
                checked={params.get("unknown_salary") === "true"}
                onChange={(e) =>
                  change({ unknown_salary: e.target.checked ? "true" : null })
                }
              />{" "}
              Include unknown salary
            </label>
            <UrlTextField
              label="Publisher"
              value={params.get("source") || ""}
              onCommit={(source) => change({ source })}
            />
            <label className="checkline">
              <input
                type="checkbox"
                checked={params.get("remote") === "true"}
                onChange={(e) =>
                  change({ remote: e.target.checked ? "true" : null })
                }
              />{" "}
              Confirmed remote only
            </label>
            <label className="checkline">
              <input
                type="checkbox"
                checked={params.get("hidden") === "true"}
                onChange={(e) =>
                  change({ hidden: e.target.checked ? "true" : null })
                }
              />{" "}
              Previously hidden jobs
            </label>
          </div>
          <p className="muted">
            Unknown fields stay unknown. Salary comparisons require the same
            currency and period.
          </p>
        </details>
      </section>
      <div className="upgrade-toolbar">
        <div role="group" aria-label="Browse view">
          {[
            ["quick", "Quick Browse"],
            ["board", "Job Board"],
            ["skipped", "Skipped"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={view === value}
              onClick={() => change({ view: value, job: null, expanded: null })}
            >
              {label}
            </button>
          ))}
        </div>
        <span>
          {result.data?.total ?? 0} stored jobs · No discovery credits used
        </span>
      </div>
      {(error || result.error) && (
        <p className="alert" role="alert">
          {error || result.error}{" "}
          <button onClick={result.refresh}>Try stored jobs again</button>
        </p>
      )}
      {result.loading && <p role="status">Loading stored opportunities…</p>}
      {!result.loading && !jobs.length ? (
        <section className="upgrade-empty">
          <Bookmark size={32} />
          <h2>
            {isSkipped
              ? "A fresh start for your shortlist."
              : "Your next opportunity belongs here."}
          </h2>
          <p>
            {isSkipped
              ? "Skipped roles will appear here so you can restore them."
              : "Discover jobs to build your library, or adjust these filters."}
          </p>
          <Link href="/discover">Open discovery</Link>
        </section>
      ) : view === "quick" && active ? (
        <section className="quick-card" aria-label="Quick Browse card">
          <span className="company-letter large">{active.employer[0]}</span>
          <p className="eyebrow">{active.employer}</p>
          <h2>{active.title}</h2>
          <p>{active.location || "Location unknown"}</p>
          <span className="match-badge">
            {active.match.score === null
              ? "Profile needed"
              : `${active.match.score}% match`}
          </span>
          <p>
            {active.description?.slice(0, 350) || "Description not supplied."}
          </p>
          <div className="card-actions">
            <button
              disabled={busy}
              onClick={() => void mutate(active, { saved: !active.saved })}
            >
              <Bookmark size={16} />
              {active.saved ? "Unsave" : "Save"} <kbd>S</kbd>
            </button>
            <button
              disabled={busy}
              onClick={() => {
                void mutate(active, { skipped: true });
                change({ job: null });
              }}
            >
              Skip <kbd>←</kbd>
            </button>
            <button
              onClick={() =>
                change({ job: active.id, expanded: "true" }, false)
              }
            >
              <Expand size={16} />
              Expand <kbd>Space</kbd>
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void prepare(active)}
            >
              Track application
            </button>
          </div>
          <p className="muted">
            Save and Skip only organize your library. Prepare opens a private
            workspace.
          </p>
        </section>
      ) : (
        <div className={"job-board " + (selected ? "has-selection" : "")}>
          <div className="board-list" aria-label="Job list">
            {jobs.map((j) => (
              <article
                key={j.id}
                className={selectedId === j.id ? "chosen" : ""}
              >
                <button
                  className="job-select"
                  onClick={() => change({ job: j.id }, false)}
                >
                  <span className="company-letter">{j.employer[0]}</span>
                  <span>
                    <strong>{j.title}</strong>
                    <small>
                      {j.employer} · {j.location || "Unknown location"}
                    </small>
                    <small>
                      {j.match.score === null
                        ? "Profile needed"
                        : `${j.match.score}% profile match`}
                    </small>
                  </span>
                </button>
                <div className="card-actions">
                  <button
                    aria-label={`${j.saved ? "Unsave" : "Save"} ${j.title}`}
                    disabled={busy}
                    onClick={() => void mutate(j, { saved: !j.saved })}
                  >
                    <Bookmark size={15} />
                  </button>
                  {isSkipped ? (
                    <button
                      disabled={busy}
                      onClick={() => void mutate(j, { skipped: false })}
                    >
                      <RotateCcw size={15} />
                      Restore
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => void mutate(j, { skipped: true })}
                    >
                      Skip
                    </button>
                  )}
                  <button disabled={busy} onClick={() => void prepare(j)}>
                    Prepare
                  </button>
                  {j.application?.id && (
                    <Link href={`/applications/${j.application.id}`}>
                      Tracker
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="board-detail">
            {selected ? (
              showDetail(selected)
            ) : (
              <div className="upgrade-empty">
                <h2>Room for the details.</h2>
                <p>Select a role to explore its requirements and your match.</p>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="upgrade-pagination">
        <button
          disabled={Number(params.get("page") || 1) <= 1}
          onClick={() =>
            change({ page: String(Number(params.get("page") || 1) - 1) }, false)
          }
        >
          <ChevronLeft size={16} />
          Previous
        </button>
        <span>
          Page {params.get("page") || 1} of{" "}
          {Math.max(1, result.data?.pages || 0)}
        </span>
        <button
          disabled={
            Number(params.get("page") || 1) >= (result.data?.pages || 0)
          }
          onClick={() =>
            change({ page: String(Number(params.get("page") || 1) + 1) }, false)
          }
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
      {expanded && selected && (
        <div className="detail-overlay">{showDetail(selected)}</div>
      )}
    </>
  );
}
