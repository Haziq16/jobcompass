"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe2,
  MapPin,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { api, useResource } from "./client";
import JobSearchForm from "./JobSearchForm";
import DirectDiscovery from "./DirectDiscovery";
import { usePersonalAi } from "./PersonalAiContext";

type Listing = {
  id: string;
  title: string;
  employer: string;
  location: string | null;
  remote: boolean | null;
  employmentType: string | null;
  salaryText: string | null;
  publishedAt: string | null;
  firstSeen: string;
  discoveredAfterBaseline: boolean;
  applyUrl: string;
  sourceUrl: string;
  saved: boolean;
  personalJobId: string | null;
  board: { platform: string; lastSuccessAt: string | null };
  recommendation?: { label: string; reasons: string[]; skills: string[] };
};
type Result = {
  jobs: Listing[];
  total: number;
  page: number;
  pages: number;
  employers: string[];
  personalization: {
    active: boolean;
    hasSignals: boolean;
    titles: string[];
    skills: { term: string; source: string }[];
    hasCv: boolean;
  };
  stats: {
    total: number;
    companies: number;
    configured: number;
    failed: number;
    lastFinishedAt: string | null;
    refreshing: boolean;
  };
};
function date(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function freshness(job: Listing) {
  if (job.publishedAt) return `Published ${date(job.publishedAt)}`;
  return `${job.discoveredAfterBaseline ? "Newly found" : "First indexed"} ${date(job.firstSeen)}`;
}
function CatalogDetail({
  job,
  onClose,
  onSave,
  saving,
  error,
}: {
  job: Listing;
  onClose: () => void;
  onSave: (job: Listing) => Promise<void>;
  saving: boolean;
  error: string;
}) {
  const { enabled: ai } = usePersonalAi();
  const ref = useRef<HTMLDialogElement>(null);
  const detail = useResource<{ description: string | null; active: boolean }>(
    `catalog/${job.id}`,
  );
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="catalog-dialog"
      onCancel={onClose}
      aria-labelledby="catalog-detail-title"
    >
      <div className="catalog-dialog-top">
        <span>{job.employer}</span>
        <button onClick={onClose} aria-label="Close job details">
          <X size={20} />
        </button>
      </div>
      <h2 id="catalog-detail-title">{job.title}</h2>
      <p className="catalog-location">
        <MapPin size={16} />
        {job.location || "Location not supplied"}
      </p>
      <div className="catalog-tags">
        {job.remote === true && <span>Remote</span>}
        {job.employmentType && <span>{job.employmentType}</span>}
        <span>{job.board.platform}</span>
      </div>
      {job.salaryText && <p>{job.salaryText}</p>}
      <p className="muted">
        {freshness(job)}
        {!job.publishedAt && " · Publication date not supplied"}
        <br />
        {job.board.lastSuccessAt &&
          `Source checked ${new Date(job.board.lastSuccessAt).toLocaleString()}`}
      </p>
      <div className="catalog-detail-actions">
        {ai && (
          <Link href={`/assistant?source=catalog&jobId=${job.id}`}>
            Review with AI
          </Link>
        )}
        <a
          className="primary catalog-apply"
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View employer posting <ArrowUpRight size={16} />
        </a>
        <button onClick={() => void onSave(job)} disabled={saving || job.saved}>
          {job.saved ? <Check size={16} /> : <Bookmark size={16} />}{" "}
          {job.saved ? "Saved" : saving ? "Saving…" : "Save job"}
        </button>
        {job.personalJobId && (
          <Link href={`/jobs?job=${job.personalJobId}`}>
            Open in job library
          </Link>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {detail.loading ? (
        <p role="status">Loading job description…</p>
      ) : detail.error ? (
        <p role="alert">
          Could not load the description. You can still view the employer
          posting.
        </p>
      ) : (
        <>
          {detail.data?.active === false && (
            <p role="status">
              This role is no longer in the latest employer feed. Check the
              employer posting before applying.
            </p>
          )}
          <h3>About this opportunity</h3>
          <div className="catalog-description">
            {detail.data?.description ||
              "The employer did not supply a description. View the original posting for full details."}
          </div>
          <p className="muted">
            Always check the employer posting for complete details, location
            eligibility and current availability.
          </p>
        </>
      )}
    </dialog>
  );
}
export default function CatalogDiscovery() {
  const router = useRouter(),
    params = useSearchParams();
  const url = params.toString();
  const { data, error, loading, refresh } = useResource<Result>(
    `catalog?${url}`,
  );
  const [selected, setSelected] = useState<Listing | null>(null),
    [saving, setSaving] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [saveError, setSaveError] = useState("");
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      void api("catalog/refresh", "POST").catch(() => {});
    };
    check();
    const background = setInterval(check, 300_000);
    const polling = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    return () => {
      clearInterval(background);
      clearInterval(polling);
    };
  }, [refresh]);
  function update(values: Record<string, string>, keepPage = false) {
    const next = new URLSearchParams(url);
    if (!keepPage) next.delete("page");
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`/discover?${next.toString()}`, { scroll: false });
  }
  async function save(job: Listing) {
    setSaving(job.id);
    setSaveError("");
    setNotice("");
    try {
      const result = await api<{ jobId: string }>(`catalog/${job.id}`, "POST");
      setSelected((current) =>
        current?.id === job.id
          ? { ...current, saved: true, personalJobId: result.jobId }
          : current,
      );
      setNotice(`Saved ${job.title} to your private shortlist.`);
      refresh();
    } catch (e) {
      setSaveError(
        (e as Error).message === "listing_unavailable"
          ? "This listing is no longer available in the current catalogue."
          : "Could not save this job. Please try again.",
      );
    } finally {
      setSaving(null);
    }
  }
  const activeFilters = Boolean(
    params.get("q") ||
    params.get("location") ||
    params.get("remote") ||
    params.get("employer") ||
    params.get("since") ||
    params.get("platform"),
  );
  return (
    <section
      id="catalog-discovery"
      className="catalog-page"
      aria-labelledby="catalog-title"
    >
      <header className="catalog-heading">
        <div>
          <h1 id="catalog-title">Discover jobs</h1>
          <p>
            Explore opportunities straight from employers. Find your fit and
            make the first move.
          </p>
        </div>
        <span className="catalog-world">
          <Globe2 size={16} /> Worldwide
        </span>
      </header>
      <div className="catalog-metrics" aria-label="Catalogue status">
        <div>
          <strong>{data ? data.stats.total.toLocaleString() : "—"}</strong>
          <span>open opportunities</span>
        </div>
        <div>
          <strong>{data ? data.stats.companies.toLocaleString() : "—"}</strong>
          <span>company boards</span>
        </div>
        <div className="catalog-refresh-status">
          <span
            className={`catalog-status-dot${data?.stats.refreshing ? " scanning" : ""}`}
          />
          <div>
            <strong>
              {data?.stats.refreshing
                ? "Checking employer feeds"
                : "Automatic updates"}
            </strong>
            <span>
              {data?.stats.lastFinishedAt
                ? `Last scan ${new Date(data.stats.lastFinishedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
                : "Preparing the catalogue"}
            </span>
          </div>
          <button
            onClick={refresh}
            aria-label="Reload catalogue results"
            title="Reload results"
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </div>
      <JobSearchForm
        query={params.get("q") || ""}
        location={params.get("location") || ""}
        onSearch={(q, location) => update({ q, location })}
      />
      <div className="catalog-personalization">
        <div
          className="catalog-mode-tabs"
          role="group"
          aria-label="Discovery mode"
        >
          <button
            aria-pressed={params.get("forYou") === "true"}
            onClick={() => update({ forYou: "true", sort: "match" })}
          >
            For you
          </button>
          <button
            aria-pressed={params.get("forYou") !== "true"}
            onClick={() => update({ forYou: "", sort: "latest" })}
          >
            All opportunities
          </button>
        </div>
        <div>
          <strong>
            {params.get("forYou") === "true"
              ? "Your CV. Your preferences. Better matches."
              : "Search roles, skills and companies"}
          </strong>
          <p>
            {params.get("forYou") === "true"
              ? data?.personalization.hasSignals
                ? "Ranked across every matching employer listing using your saved CV and target roles. Location and recency help break ties."
                : "Add a CV or target roles to your profile to personalize this feed."
              : "Search understands common role variants such as developer and engineer. Results prioritize relevant titles."}
          </p>
        </div>
        <Link href="/profile">Edit my job preferences ↗</Link>
      </div>
      {params.get("forYou") === "true" && data?.personalization.hasSignals && (
        <div
          className="catalog-signal-chips"
          aria-label="Your matching signals"
        >
          {data.personalization.titles.slice(0, 4).map((t) => (
            <span key={t}>Role · {t}</span>
          ))}
          {data.personalization.skills.slice(0, 8).map((s) => (
            <span key={s.term}>
              {s.source === "cv" ? "CV" : "Profile"} · {s.term}
            </span>
          ))}
        </div>
      )}
      <details className="catalog-filter-disclosure">
        <summary>Filters{activeFilters ? " · Active" : ""}</summary>
        <div className="catalog-filters">
          <label>
            Company
            <select
              value={params.get("employer") || ""}
              onChange={(e) => update({ employer: e.target.value })}
            >
              <option value="">All companies</option>
              {data?.employers.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            Freshness
            <select
              value={params.get("since") || ""}
              onChange={(e) => update({ since: e.target.value })}
            >
              <option value="">Any time</option>
              <option value="1h">Last hour</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </select>
          </label>
          <label>
            Date filter uses
            <select
              value={params.get("freshness") || "posted"}
              onChange={(e) => update({ freshness: e.target.value })}
            >
              <option value="posted">Employer publication date</option>
              <option value="found">
                Newly discovered after initial import
              </option>
            </select>
          </label>
          <label>
            Source
            <select
              value={params.get("platform") || ""}
              onChange={(e) => update({ platform: e.target.value })}
            >
              <option value="">All sources</option>
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="ashby">Ashby</option>
            </select>
          </label>
          <label className="catalog-remote">
            <input
              type="checkbox"
              checked={params.get("remote") === "true"}
              onChange={(e) =>
                update({ remote: e.target.checked ? "true" : "" })
              }
            />
            Remote roles
          </label>
          {activeFilters && (
            <button
              className="catalog-clear"
              onClick={() => router.replace("/discover", { scroll: false })}
            >
              Clear filters
            </button>
          )}
        </div>
        <p className="catalog-freshness-note">
          Feeds are checked about every 30 minutes in the background, and as
          often as every 5 minutes while browsing. Source availability and
          scheduler delays can affect timing. Remote roles may have location
          restrictions.
        </p>
        <p className="catalog-date-note">
          Latest uses publication dates when supplied, or discovery time for
          newly detected roles. Initial imports are labelled “First indexed” and
          aren’t counted as newly posted.
        </p>
      </details>
      <div className="catalog-results-heading">
        <h2>
          {loading
            ? "Finding opportunities…"
            : data
              ? `${data.total.toLocaleString()} ${activeFilters ? "matching" : "available"} jobs`
              : "Opportunities"}
        </h2>
        <label>
          <span>Sort by</span>
          <select
            value={
              params.get("sort") || (params.get("q") ? "relevance" : "latest")
            }
            onChange={(e) => update({ sort: e.target.value })}
          >
            <option value="match" disabled={params.get("forYou") !== "true"}>
              Best match for me
            </option>
            <option value="relevance">Search relevance</option>
            <option value="latest">Latest opportunities</option>
            <option value="found">Most recently indexed</option>
          </select>
        </label>
      </div>
      {error && (
        <div role="alert" className="catalog-empty">
          <p>Could not load discovery. Your saved jobs are still available.</p>
          <button onClick={refresh}>Try again</button>
        </div>
      )}
      {notice && (
        <p className="catalog-notice" role="status">
          {notice} <Link href="/saved">View shortlist</Link>
        </p>
      )}
      {saveError && <p role="alert">{saveError}</p>}
      {data?.stats.failed ? (
        <p className="catalog-date-note">
          {data.stats.failed} employer{" "}
          {data.stats.failed === 1 ? "feed is" : "feeds are"} temporarily
          unavailable. Previously confirmed listings remain visible for up to 48
          hours.
        </p>
      ) : null}
      <div className="catalog-grid" aria-busy={loading}>
        {loading && !data
          ? Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="catalog-skeleton" />
            ))
          : data?.jobs.map((job) => (
              <article className="catalog-card" key={job.id}>
                <div className="catalog-card-top">
                  <span className="catalog-company-initial" aria-hidden="true">
                    {job.employer.slice(0, 1)}
                  </span>
                  <div>
                    <p>{job.employer}</p>
                    <small>{job.board.platform}</small>
                  </div>
                  <button
                    className={job.saved ? "is-saved" : ""}
                    aria-label={
                      job.saved ? `${job.title} saved` : `Save ${job.title}`
                    }
                    disabled={job.saved || saving !== null}
                    onClick={() => void save(job)}
                  >
                    {job.saved ? <Check size={19} /> : <Bookmark size={19} />}
                  </button>
                </div>
                <h3>
                  <button
                    onClick={() => {
                      setSelected(job);
                      setSaveError("");
                    }}
                  >
                    {job.title}
                  </button>
                </h3>
                <p className="catalog-location">
                  <MapPin size={15} />
                  {job.location || "Location not supplied"}
                </p>
                <div className="catalog-tags">
                  {job.remote === true && <span>Remote</span>}
                  {job.employmentType && <span>{job.employmentType}</span>}
                </div>
                {job.salaryText && (
                  <p className="catalog-salary">{job.salaryText}</p>
                )}
                <div className="catalog-card-bottom">
                  {params.get("forYou") === "true" && job.recommendation && (
                    <details className="catalog-match-details">
                      <summary>{job.recommendation.label}</summary>
                      <ul>
                        {job.recommendation.reasons.length ? (
                          job.recommendation.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))
                        ) : (
                          <li>
                            No direct profile terms found. You can still explore
                            this role.
                          </li>
                        )}
                      </ul>
                      <p>
                        Text overlap is not a qualification or work-eligibility
                        decision.
                      </p>
                    </details>
                  )}
                  <small>{freshness(job)}</small>
                  <button onClick={() => setSelected(job)}>
                    View job <ArrowUpRight size={15} />
                  </button>
                </div>
              </article>
            ))}
      </div>
      {!loading && data?.total === 0 && (
        <div className="catalog-empty">
          <Search size={28} />
          <h3>
            {activeFilters
              ? "No matches with these filters"
              : "The catalogue is getting ready"}
          </h3>
          <p>
            {activeFilters
              ? "Try a broader title or location, or remove a freshness filter. Not every employer supplies a publication date."
              : "New employer feeds are being checked. Reload the results shortly."}
          </p>
          {activeFilters && (
            <button onClick={() => router.replace("/discover")}>
              Clear filters
            </button>
          )}
        </div>
      )}
      {data && data.pages > 1 && (
        <nav className="catalog-pagination" aria-label="Discovery pages">
          <button
            disabled={loading || data.page <= 1}
            onClick={() => update({ page: String(data.page - 1) }, true)}
          >
            <ChevronLeft size={17} />
            Previous
          </button>
          <span>
            Page {data.page.toLocaleString()} of {data.pages.toLocaleString()}
          </span>
          <button
            disabled={loading || data.page >= data.pages}
            onClick={() => update({ page: String(data.page + 1) }, true)}
          >
            Next
            <ChevronRight size={17} />
          </button>
        </nav>
      )}
      <details className="catalog-custom-board">
        <summary>Looking for a specific company? Import another board</summary>
        <DirectDiscovery />
      </details>
      {selected && (
        <CatalogDetail
          key={selected.id}
          job={selected}
          onClose={() => setSelected(null)}
          onSave={save}
          saving={saving === selected.id}
          error={saveError}
        />
      )}
    </section>
  );
}
