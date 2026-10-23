"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  MapPin,
  RotateCcw,
  X,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import type { MatchListing } from "./match-types";
import { useResource } from "./client";
export const jobDate = (job: {
  publishedAt: string | null;
  firstSeen: string;
}) =>
  `${job.publishedAt ? "Published" : "First discovered"} ${new Date(job.publishedAt || job.firstSeen).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
export function MatchDetails({
  job,
  onClose,
  onQueue,
  onSave,
  busy,
}: {
  job: {
    id: string;
    title: string;
    employer: string;
    location: string | null;
    applyUrl: string;
    recommendation?: MatchListing["recommendation"];
    requirements?: string[];
    warnings?: string[];
    applicationConsent?: MatchListing["applicationConsent"];
  };
  onClose: () => void;
  onQueue?: () => void;
  onSave?: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const detail = useResource<{
    description: string | null;
    active: boolean;
    salaryText: string | null;
    board: { lastSuccessAt: string | null };
  }>(`catalog/${job.id}`);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="match-dialog"
      onCancel={onClose}
      aria-labelledby="match-detail-title"
    >
      <div className="match-dialog-heading">
        <span>{job.employer}</span>
        <button onClick={onClose} aria-label="Close job details">
          <X size={20} />
        </button>
      </div>
      <h2 id="match-detail-title">{job.title}</h2>
      <p>{job.location || "Location not supplied"}</p>
      {job.recommendation && (
        <section className="match-detail-evidence">
          <h3>Why this appeared</h3>
          <ul>
            {job.recommendation.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p>
            Based on text mentions and your preferences, not a hiring
            probability.
          </p>
        </section>
      )}
      {job.requirements?.length ? (
        <section>
          <h3>Requirements mentioned by the employer</h3>
          <ul className="match-cautions">
            {job.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {job.warnings?.length ? (
        <ul className="match-cautions">
          {job.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      {detail.loading ? (
        <p role="status">Loading employer description…</p>
      ) : detail.error ? (
        <div role="alert">
          <p>Could not load the description.</p>
          <button onClick={detail.refresh}>Retry description</button>
        </div>
      ) : (
        <>
          {detail.data?.active === false && (
            <p role="status" className="match-error">
              No longer in the current employer feed. Check availability before
              applying.
            </p>
          )}
          <h3>From the employer</h3>
          <p className="match-description">
            {detail.data?.description ||
              "No description supplied. View the employer posting for details."}
          </p>
          {detail.data?.board.lastSuccessAt && (
            <p className="muted">
              Source checked{" "}
              {new Date(detail.data.board.lastSuccessAt).toLocaleString()}
            </p>
          )}
        </>
      )}
      {job.applicationConsent && (
        <p className="match-application-consent">
          Authorising sends {job.applicationConsent.cvName} and your confirmed
          contact details and application answers to {job.employer}
          {job.applicationConsent.submit
            ? " for automatic submission when complete."
            : " to fill the form."}
        </p>
      )}
      <div className="match-detail-footer">
        {onQueue && (
          <button
            className="primary"
            onClick={onQueue}
            disabled={busy || detail.data?.active === false}
          >
            <Check size={17} />
            {job.applicationConsent
              ? "Authorise this application"
              : "Add to queue"}
          </button>
        )}
        {onSave && (
          <button onClick={onSave} disabled={busy}>
            <Bookmark size={17} />
            Save for later
          </button>
        )}
        <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">
          Employer posting
          <ArrowUpRight size={16} />
        </a>
        <span>Opening a posting does not submit an application.</span>
      </div>
    </dialog>
  );
}
export default function MatchCard({
  job,
  nextTitle,
  busy,
  onDecision,
  onDetails,
  onUndo,
  canUndo,
}: {
  job: MatchListing;
  nextTitle?: string;
  busy: boolean;
  onDecision: (state: "queued" | "saved" | "passed") => void;
  onDetails: () => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const [drag, setDrag] = useState(0),
    [dragging, setDragging] = useState(false);
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    horizontal: boolean;
  } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const decideRef = useRef(onDecision);
  decideRef.current = onDecision;
  useEffect(() => {
    function keys(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        busy ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        target.closest(
          "input,textarea,select,button,a,dialog,[contenteditable=true]",
        )
      )
        return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        decideRef.current(e.key === "ArrowRight" ? "queued" : "passed");
      }
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [busy]);
  const threshold = 100;
  return (
    <div className="match-deck-column" ref={container}>
      <p className="match-deck-caption">One opportunity. Your next move.</p>
      {job.readiness && (
        <section
          className="match-readiness"
          aria-label="Application eligibility"
        >
          <strong>{job.readiness.label}</strong>
          <p>{job.readiness.action}</p>
          {job.readiness.reasons.length > 0 && (
            <ul>
              {job.readiness.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {!job.applicationConsent && (
            <p>
              Right swipe saves this to your queue for review. It will not start
              an automatic application.
            </p>
          )}
        </section>
      )}
      {job.applicationConsent && (
        <p
          className="match-application-consent"
          id="match-application-disclosure"
          role="note"
        >
          Swipe right to authorise sending{" "}
          <strong>{job.applicationConsent.cvName}</strong> and your confirmed
          contact details and application answers to{" "}
          <strong>{job.employer}</strong>
          {job.applicationConsent.submit
            ? ", and submit this application automatically when complete."
            : " to fill this application."}{" "}
          Missing answers or CAPTCHA pause processing.
        </p>
      )}

      <div className="match-card-stage">
        <div className="match-next-card" aria-hidden="true">
          <span>
            {nextTitle
              ? "Another opportunity follows"
              : "You’re near the end of this batch"}
          </span>
        </div>
        <article
          key={job.id}
          className="match-card"
          aria-labelledby="swipe-job-title"
          aria-describedby={
            job.applicationConsent ? "match-application-disclosure" : undefined
          }
          aria-busy={busy}
          data-dragging={dragging}
          style={
            {
              "--drag-x": `${drag}px`,
              "--drag-angle": `${drag / 30}deg`,
            } as CSSProperties
          }
          onPointerDown={(e) => {
            if (
              busy ||
              e.button !== 0 ||
              (e.target as HTMLElement).closest("button,a,summary")
            )
              return;
            pointer.current = {
              id: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              horizontal: false,
            };
          }}
          onPointerMove={(e) => {
            const p = pointer.current;
            if (!p || p.id !== e.pointerId || busy) return;
            const dx = e.clientX - p.x,
              dy = e.clientY - p.y;
            if (
              !p.horizontal &&
              Math.abs(dy) > 12 &&
              Math.abs(dy) > Math.abs(dx)
            ) {
              pointer.current = null;
              return;
            }
            if (Math.abs(dx) > 10) {
              p.horizontal = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(true);
              setDrag(Math.max(-180, Math.min(180, dx)));
            }
          }}
          onPointerUp={(e) => {
            const p = pointer.current;
            pointer.current = null;
            setDragging(false);
            setDrag(0);
            if (p?.horizontal) {
              const dx = e.clientX - p.x;
              if (Math.abs(dx) >= threshold)
                onDecision(dx > 0 ? "queued" : "passed");
            }
          }}
          onPointerCancel={() => {
            pointer.current = null;
            setDragging(false);
            setDrag(0);
          }}
        >
          <div
            className="match-swipe-stamp"
            data-side={drag > 0 ? "right" : "left"}
            style={{ opacity: Math.min(Math.abs(drag) / threshold, 1) }}
            aria-hidden="true"
          >
            {drag > 0 ? "Add to queue" : "Pass"}
          </div>
          <div className="match-card-header">
            <span className="match-employer">{job.employer}</span>
            <span className="match-fit-label">{job.recommendation.label}</span>
          </div>
          <h2 id="swipe-job-title">{job.title}</h2>
          <p className="match-location">
            <MapPin size={17} />
            {job.location || "Location not supplied"}
          </p>
          <div className="match-job-facts">
            <span>
              {job.remote === true
                ? "Remote"
                : job.remote === false
                  ? "Not marked remote"
                  : "Arrangement unknown"}
            </span>
            <span>{job.employmentType || "Employment type unknown"}</span>
            <span>{job.salaryText || "Salary not supplied"}</span>
          </div>
          <p className="swipe-role-summary">
            {job.summary}
            {job.summary.length === 460 ? "…" : ""}
          </p>
          <section className="match-evidence">
            <h3>Why it’s in your deck</h3>
            <ul>
              {job.recommendation.reasons.length ? (
                job.recommendation.reasons.slice(0, 4).map((r) => (
                  <li key={r}>
                    <Check size={15} />
                    {r}
                  </li>
                ))
              ) : (
                <li>Your preferences brought this role into view.</li>
              )}
            </ul>
          </section>
          {job.otherSkills.length > 0 && (
            <p className="match-other-skills">
              <strong>Also mentioned</strong>
              {job.otherSkills.join(" · ")}
            </p>
          )}
          <p className="match-card-caution">
            <AlertCircle size={15} />
            {job.warnings[0] || "Check employer requirements before applying"}
          </p>
          <div className="match-card-footer">
            <small>{jobDate(job)}</small>
            <button disabled={busy} onClick={onDetails}>
              View details
              <ArrowRight size={16} />
            </button>
          </div>
        </article>
      </div>
      <div
        className="match-decision-buttons"
        role="group"
        aria-label="Decide on this job"
      >
        <button
          className="match-undo"
          disabled={busy || !canUndo}
          onClick={onUndo}
          aria-label="Undo last decision"
        >
          <RotateCcw size={20} />
          <span>Undo</span>
        </button>
        <button
          className="match-pass"
          disabled={busy}
          onClick={() => onDecision("passed")}
        >
          <X size={23} />
          <span>Pass</span>
        </button>
        <button
          className="match-save"
          disabled={busy}
          onClick={() => onDecision("saved")}
        >
          <Bookmark size={22} />
          <span>Save for later</span>
        </button>
        <button
          className="match-interest primary"
          disabled={busy}
          onClick={() => onDecision("queued")}
        >
          <Check size={23} />
          <span>
            {busy
              ? "Saving..."
              : job.applicationConsent
                ? job.applicationConsent.submit
                  ? "Authorise & apply"
                  : "Authorise & fill"
                : "Queue for review"}
          </span>
        </button>
      </div>
      <p className="match-shortcuts">
        {job.applicationConsent
          ? "Swipe right or use the right arrow to authorise sending the shown CV and confirmed profile to this employer for processing under your saved rules."
          : "Drag a card or use the left arrow to pass and the right arrow to queue. No applications are submitted."}
      </p>
      <aside className="match-bottom-note">
        <AlertCircle size={16} />
        <span>
          Skill mentions are matching signals. Check qualifications and
          eligibility in the full posting.
        </span>
      </aside>
    </div>
  );
}
