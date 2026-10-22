"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { statuses } from "@/lib/contracts";
import { api, useResource } from "./client";
import UrlTextField from "./UrlTextField";
import { usePersonalAi } from "./PersonalAiContext";
type Application = {
  id: string;
  jobId: string;
  status: string;
  preparationState: string;
  notes: string;
  url: string | null;
  appliedAt: string | null;
  followUpAt: string | null;
  job: {
    id: string;
    title: string;
    employer: string;
    description: string | null;
    sources: { applyLinks: { url: string; publisher: string }[] }[];
  };
  events: {
    id: string;
    status: string;
    kind: string;
    message: string | null;
    createdAt: string;
  }[];
  attempts: {
    id: string;
    state: string;
    evidence: unknown;
    targetUrl: string;
    createdAt: string;
  }[];
};
type Row = {
  id: string;
  title: string;
  employer: string;
  location: string | null;
  application: Omit<Application, "job" | "events" | "attempts">;
};
export function Applications() {
  const params = useSearchParams(),
    router = useRouter();
  const query = params.toString();
  const result = useResource<{ jobs: Row[]; total: number; pages: number }>(
    `jobs?tracked=true&${query}`,
  );
  const board = params.get("view") !== "table";
  function change(key: string, value: string) {
    const p = new URLSearchParams(query);
    p.set(key, value);
    if (key !== "page") p.delete("page");
    router.push(`/applications?${p}`, { scroll: false });
  }
  return (
    <>
      <div className="upgrade-heading">
        <div>
          <h1>Applications</h1>
          <p>Track progress, add notes and keep your follow-ups in view.</p>
        </div>
        <Link href="/jobs">Find another opportunity</Link>
      </div>
      <div className="upgrade-toolbar">
        <UrlTextField
          actionLabel="Search"
          label="Search roles or companies"
          value={params.get("q") || ""}
          onCommit={(q) => change("q", q)}
        />
        <div role="group" aria-label="Application view">
          <button aria-pressed={board} onClick={() => change("view", "board")}>
            Board
          </button>
          <button aria-pressed={!board} onClick={() => change("view", "table")}>
            Table
          </button>
        </div>
        <span>{result.data?.total ?? 0} tracked</span>
      </div>
      {result.error && (
        <p role="alert" className="alert">
          {result.error}
          <button onClick={result.refresh}>Retry</button>
        </p>
      )}
      {result.loading && <p role="status">Loading your applications…</p>}
      {!result.loading && !result.data?.jobs.length && (
        <section className="upgrade-empty">
          <h2>A place for your progress.</h2>
          <p>Choose Prepare application on a stored role to begin.</p>
          <Link href="/jobs">Browse jobs</Link>
        </section>
      )}
      {board ? (
        <div className="application-lanes">
          {statuses.map((s) => (
            <section key={s}>
              <h2>
                {s}
                <small>
                  {result.data?.jobs.filter((j) => j.application.status === s)
                    .length || 0}
                </small>
              </h2>
              {result.data?.jobs
                .filter((j) => j.application.status === s)
                .map((j) => (
                  <Link
                    className="application-tile"
                    key={j.id}
                    href={`/applications/${j.application.id}`}
                  >
                    <span className="company-letter">{j.employer[0]}</span>
                    <h3>{j.title}</h3>
                    <p>{j.employer}</p>
                    <small>{j.location || "Location unknown"}</small>
                    <span className="state-pill">
                      Preparation:{" "}
                      {j.application.preparationState.replaceAll("_", " ")}
                    </span>
                  </Link>
                ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Employer outcome</th>
                <th>Preparation</th>
                <th>Follow up</th>
              </tr>
            </thead>
            <tbody>
              {result.data?.jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    <Link href={`/applications/${j.application.id}`}>
                      {j.title} · {j.employer}
                    </Link>
                  </td>
                  <td>{j.application.status}</td>
                  <td>{j.application.preparationState}</td>
                  <td>{j.application.followUpAt?.slice(0, 10) || "Not set"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="upgrade-pagination">
        <button
          disabled={Number(params.get("page") || 1) <= 1}
          onClick={() =>
            change("page", String(Number(params.get("page") || 1) - 1))
          }
        >
          Previous
        </button>
        <span>
          Page {params.get("page") || 1} /{" "}
          {Math.max(1, result.data?.pages || 0)}
        </span>
        <button
          disabled={
            Number(params.get("page") || 1) >= (result.data?.pages || 0)
          }
          onClick={() =>
            change("page", String(Number(params.get("page") || 1) + 1))
          }
        >
          Next
        </button>
      </div>
      <p className="muted">
        Board counts reflect this page of stored records. Opening a link never
        changes application status.
      </p>
    </>
  );
}
function Overview({ app, refresh }: { app: Application; refresh: () => void }) {
  const [status, setStatus] = useState(app.status),
    [notes, setNotes] = useState(app.notes),
    [url, setUrl] = useState(app.url || ""),
    [applied, setApplied] = useState(app.appliedAt?.slice(0, 10) || ""),
    [follow, setFollow] = useState(app.followUpAt?.slice(0, 10) || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api(`applications/${app.jobId}`, "PATCH", {
        status,
        notes,
        url: url || null,
        appliedAt: applied ? new Date(applied).toISOString() : null,
        followUpAt: follow ? new Date(follow).toISOString() : null,
      });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="upgrade-panel">
      <h2>Keep your next step clear.</h2>
      <p>
        Preparation:{" "}
        <strong>{app.preparationState.replaceAll("_", " ")}</strong>. Employer
        outcome is recorded below by you.
      </p>
      <div className="filter-options">
        <label>
          Employer outcome / manual tracker
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Application URL
          <input value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label>
          Applied date
          <input
            type="date"
            value={applied}
            onChange={(e) => setApplied(e.target.value)}
          />
        </label>
        <label>
          Follow-up date
          <input
            type="date"
            value={follow}
            onChange={(e) => setFollow(e.target.value)}
          />
        </label>
      </div>
      <label>
        Your notes
        <textarea
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={10000}
        />
      </label>
      <button className="primary" disabled={busy} onClick={() => void save()}>
        Save tracker
      </button>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <h3>Employer application links</h3>
      {app.job.sources
        .flatMap((s) => s.applyLinks)
        .map((l, i) => (
          <p key={i}>
            <a href={l.url} rel="noopener noreferrer" target="_blank">
              Open {l.publisher || "employer"} application ↗
            </a>
          </p>
        ))}
      <p className="muted">
        Opening these links does not mark the role Applied or Submitted.
      </p>
    </section>
  );
}
export function ApplicationDetail({ id }: { id: string }) {
  const { enabled: personalAiEnabled } = usePersonalAi();
  const params = useSearchParams(),
    router = useRouter();
  const tab = params.get("tab") || "overview";
  const resource = useResource<Application>(`workspace/applications/${id}`);
  const app = resource.data;
  return (
    <>
      <Link href="/applications">← All applications</Link>
      {resource.error && (
        <p role="alert" className="alert">
          {resource.error}
          <button onClick={resource.refresh}>Retry</button>
        </p>
      )}
      {resource.loading && <p role="status">Loading application…</p>}
      {app && (
        <>
          <div className="upgrade-heading">
            <div>
              <span className="eyebrow">{app.job.employer}</span>
              <h1>{app.job.title}</h1>
              <p>
                {app.status} · Preparation:{" "}
                {app.preparationState.replaceAll("_", " ")}
              </p>
            </div>
            <Link href={`/jobs?job=${app.jobId}`}>View job &amp; match</Link>
          </div>
          <div
            className="upgrade-toolbar"
            role="group"
            aria-label="Application sections"
          >
            {[
              "overview",
              ...(personalAiEnabled ? ["documents"] : []),
              "timeline",
            ].map((t) => (
              <button
                key={t}
                aria-pressed={tab === t}
                onClick={() =>
                  router.push(`/applications/${id}?tab=${t}`, { scroll: false })
                }
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          {tab === "overview" ? (
            <>
              <Overview
                key={app.id + app.status + app.notes}
                app={app}
                refresh={resource.refresh}
              />
            </>
          ) : tab === "documents" && personalAiEnabled ? (
            <ApplicationStudioDocuments jobId={app.jobId} />
          ) : (
            <section className="upgrade-panel">
              <h2>Your application timeline</h2>
              {app.events.length ? (
                app.events.map((e) => (
                  <div className="timeline-event" key={e.id}>
                    <span className="state-pill">{e.kind}</span>
                    <h3>{e.message || `Status: ${e.status}`}</h3>
                    <p>
                      {new Date(e.createdAt).toLocaleString()} · {e.status}
                    </p>
                  </div>
                ))
              ) : (
                <p>No activity recorded yet.</p>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
function ApplicationStudioDocuments({ jobId }: { jobId: string }) {
  const result = useResource<{ reviewId: string | null }>(
    `ai/application?source=workspace&jobId=${encodeURIComponent(jobId)}`,
  );
  const review = result.data?.reviewId;
  return (
    <section className="upgrade-panel">
      <h2>Documents for this application</h2>
      <p>
        Open your private workspace to compare sources, edit your CV and
        download the version you have reviewed.
      </p>
      {result.loading ? (
        <p role="status">Finding your saved documents…</p>
      ) : result.error ? (
        <p role="alert">
          Documents could not be loaded.{" "}
          <button onClick={result.refresh}>Reload</button>
        </p>
      ) : (
        <Link
          href={`/assistant?source=workspace&jobId=${encodeURIComponent(jobId)}${review ? `&review=${review}&step=documents` : "&step=cv"}`}
        >
          {review
            ? "Open tailored CV & downloads"
            : "Prepare application documents"}{" "}
          →
        </Link>
      )}
    </section>
  );
}
