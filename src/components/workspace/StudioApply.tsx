"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CheckCircle2, BriefcaseBusiness } from "lucide-react";
import { api, useResource } from "./client";
import type { Job } from "./ai-studio-types";
type Target = {
  jobId: string | null;
  applyUrl: string | null;
  available: boolean;
  application: { id: string; status: string; appliedAt: string | null } | null;
};
export function StudioApply({
  job,
  onDocuments,
  onCv,
}: {
  job: Job;
  onDocuments: () => void;
  onCv: () => void;
}) {
  const path = `ai/application?source=${job.source}&jobId=${encodeURIComponent(job.id)}`;
  const result = useResource<Target>(path);
  const [saved, setSaved] = useState<Target | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = saved || result.data;
  const recorded = Boolean(
    current?.application &&
    !["Saved", "Preparing"].includes(current.application.status),
  );
  async function update(action: "prepare" | "confirm_submission") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setSaved(
        await api<Target>("ai/application", "POST", {
          source: job.source,
          jobId: job.id,
          action,
        }),
      );
    } catch {
      setError(
        "Your application could not be updated. Check Applications before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="studio-apply">
      <span className="studio-kicker">FINAL STEP</span>
      <h2>{recorded ? "Application recorded" : "Ready to apply?"}</h2>
      <p>
        {recorded
          ? "Your submission is recorded. Keep track of responses and next steps in Applications."
          : `Take your CV to ${job.employer}, complete their form, then come back to track the result.`}
      </p>
      <div className="studio-apply-checklist">
        <button onClick={onCv}>
          <FileIcon />
          Your original CV<span>View source</span>
        </button>
        <button onClick={onDocuments}>
          <FileIcon />
          Tailored CV<span>Review & download</span>
        </button>
      </div>
      {result.loading && <p role="status">Loading application details…</p>}
      {(error || result.error) && (
        <p role="alert" className="ai-error">
          {error || "Could not load the employer link."}
          <button onClick={result.refresh}>Reload</button>
        </p>
      )}
      {current && (
        <>
          <div className="studio-apply-destination">
            <BriefcaseBusiness size={24} />
            <div>
              <strong>{job.title}</strong>
              <p>{job.employer}</p>
              <span>
                {current.applyUrl
                  ? new URL(current.applyUrl).hostname
                  : "Employer link unavailable"}
              </span>
            </div>
          </div>
          {recorded && current.application && (
            <Link
              className="studio-primary-link"
              href={`/applications/${current.application.id}`}
            >
              Open application & timeline <ArrowUpRight size={17} />
            </Link>
          )}
          {current.applyUrl ? (
            <>
              <a
                className={
                  recorded ? "studio-employer-link" : "studio-primary-link"
                }
                href={current.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  if (!current.application) void update("prepare");
                }}
              >
                {recorded
                  ? "View employer posting"
                  : "Apply on employer website"}{" "}
                <ArrowUpRight size={17} />
              </a>
            </>
          ) : (
            <p>
              This posting is no longer available through its original feed.
              Your saved documents remain here.
            </p>
          )}
          <p className="ai-fine-print">
            {recorded
              ? "Your recorded status is based on your confirmation. Add responses and follow-ups to the timeline."
              : "The employer form opens in a new tab. Download your CV first. Record submission below after you finish."}
          </p>
          <div className="studio-track-card">
            <h3>
              {current.application
                ? "Your application is tracked"
                : "Keep this opportunity in your pipeline"}
            </h3>
            <p>
              Status:{" "}
              <strong>{current.application?.status || "Not tracked"}</strong>
            </p>
            {!current.application && (
              <button
                disabled={busy || !current.available}
                onClick={() => void update("prepare")}
              >
                Save to Applications
              </button>
            )}
            {current.application &&
              ["Saved", "Preparing"].includes(current.application.status) && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void update("confirm_submission")}
                >
                  <CheckCircle2 size={16} />
                  I’ve submitted my application
                </button>
              )}
            {current.application && !recorded && (
              <Link href={`/applications/${current.application.id}`}>
                Open application & timeline <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
function FileIcon() {
  return <span aria-hidden="true">↗</span>;
}
