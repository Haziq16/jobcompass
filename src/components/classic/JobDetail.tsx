"use client";
import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  ArrowUpRight,
  MapPin,
  Plus,
  Check,
  X,
  EyeOff,
} from "lucide-react";
import { statuses } from "@/lib/contracts";
import { type AppData, type Job, date, salary, IconButton } from "./common";

export default function JobDetail({
  job: j,
  demo,
  close,
  onUpdate,
  onTrack,
}: {
  job: Job;
  demo: boolean;
  close: () => void;
  onUpdate: (data: {
    saved?: boolean;
    hidden?: boolean;
    notes?: string;
    tags?: string[];
  }) => Promise<void>;
  onTrack: (data: Omit<AppData, "events">) => Promise<void>;
}) {
  const [tab, setTab] = useState("Overview");
  const [notes, setNotes] = useState(j.saved?.notes || "");
  const [tags, setTags] = useState(j.saved?.tags.join(", ") || "");
  const [app, setApp] = useState<Omit<AppData, "events">>({
    status: j.application?.status || "Saved",
    notes: j.application?.notes || "",
    url: j.application?.url || null,
    appliedAt: j.application?.appliedAt || null,
    followUpAt: j.application?.followUpAt || null,
  });
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = panel.current;
    if (!element) return;
    const media = window.matchMedia(
      `(max-width: ${element.closest(".board-detail") ? 760 : 950}px)`,
    );
    const previousOverflow = document.body.style.overflow;
    const updateRole = () => {
      const modal =
        media.matches || Boolean(element.closest(".detail-overlay"));
      element.setAttribute("role", modal ? "dialog" : "region");
      if (modal) {
        element.setAttribute("aria-modal", "true");
        document.body.style.overflow = "hidden";
        element.focus();
      } else {
        element.removeAttribute("aria-modal");
        document.body.style.overflow = previousOverflow;
      }
    };
    updateRole();
    media.addEventListener("change", updateRole);
    if (!previous?.matches("input,textarea,select,[contenteditable]"))
      element.focus();
    return () => {
      media.removeEventListener("change", updateRole);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [j.id]);
  const links = j.sources
    .flatMap((s) => s.applyLinks)
    .filter((l, i, a) => a.findIndex((v) => v.url === l.url) === i)
    .sort((a, b) => Number(b.direct) - Number(a.direct));
  return (
    <section
      ref={panel}
      tabIndex={-1}
      className="job-detail"
      aria-label={"Details for " + j.title}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
        if (
          event.key === "Tab" &&
          panel.current?.getAttribute("aria-modal") === "true"
        ) {
          const controls = Array.from(
            panel.current.querySelectorAll<HTMLElement>(
              'a[href],button:not(:disabled),input,select,textarea,[tabindex="0"]',
            ),
          ).filter((el) => el.offsetParent !== null);
          const first = controls[0],
            last = controls[controls.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === panel.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="detail-topline">
        <span>OPPORTUNITY DETAILS</span>
        <IconButton label="Close job details" onClick={close}>
          <X size={18} />
        </IconButton>
      </div>
      <div className="detail-header">
        <span
          className={"company-letter large tint-" + (j.employer.length % 4)}
        >
          {j.employer[0]}
        </span>
        <div className="detail-company">
          {j.employer}
          <span>{j.sources[0]?.publisher || "JSearch"}</span>
        </div>
        <IconButton
          label={j.saved ? "Unsave job" : "Save job"}
          active={Boolean(j.saved)}
          onClick={() => void onUpdate({ saved: !j.saved })}
        >
          <Bookmark size={19} fill={j.saved ? "currentColor" : "none"} />
        </IconButton>
      </div>
      <h2>{j.title}</h2>
      <div className="detail-location">
        <MapPin size={15} />
        {j.location || "Location unknown"}
      </div>
      <div className="detail-facts">
        <span>
          {j.remote === true
            ? "Remote"
            : j.remote === false
              ? "On-site / hybrid unspecified"
              : "Arrangement unknown"}
        </span>
        <span>{j.employmentType || "Type not supplied"}</span>
      </div>
      <p className="detail-salary">{salary(j)}</p>
      <div className="detail-actions">
        {links[0] && !demo ? (
          <a
            className="primary"
            href={links[0].url}
            target="_blank"
            rel="noreferrer"
          >
            {links[0].direct ? "Apply with employer" : "View application"}
            <ArrowUpRight size={16} />
          </a>
        ) : (
          <button className="primary" disabled>
            {demo ? "Fictional listing" : "No application link"}
          </button>
        )}
        <button className="secondary" onClick={() => setTab("Track")}>
          Track job
          <Plus size={16} />
        </button>
      </div>
      <p className="apply-note">
        Opening a link does not mark this job as Applied.
      </p>
      <div className="detail-tabs" role="tablist">
        {["Overview", "Your match", "Notes", "Track"].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="detail-body">
        {tab === "Overview" && (
          <>
            <h3>About this opportunity</h3>
            <p className="description">
              {j.description || "No description was supplied by the source."}
            </p>
            {j.qualifications.length > 0 && (
              <>
                <h3>Qualification highlights</h3>
                <ul>
                  {j.qualifications.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </>
            )}
            <div className="source-info">
              <span>Published {date(j.publishedAt)}</span>
              <span>Fetched {date(j.lastFetched)}</span>
            </div>
            {links.length > 0 && (
              <>
                <h3>Original application options</h3>
                {links.map((l) => (
                  <a
                    className="source-link"
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {l.publisher}
                    {l.direct ? " · Direct employer" : ""}
                    <ArrowUpRight size={14} />
                  </a>
                ))}
              </>
            )}
            <p className="muted">
              Source: JSearch, a third-party aggregator of public listings.
              Remote eligibility and vacancy availability are not verified.
              Listings remain stored even if absent from a later search.
            </p>
          </>
        )}
        {tab === "Your match" && (
          <>
            <div className="match-summary">
              <div>
                <strong>
                  {j.match.score ?? "—"}
                  <small>{j.match.score === null ? "" : "%"}</small>
                </strong>
                <span>Personal relevance</span>
              </div>
              <div>
                <strong>
                  {j.match.coverage}
                  <small>%</small>
                </strong>
                <span>Evidence coverage</span>
              </div>
            </div>
            <p className="muted">{j.match.note}</p>
            {j.match.categories.map((c) => (
              <div className="match-category" key={c.name}>
                <div>
                  <strong>{c.name}</strong>
                  <span>
                    {c.known ? Math.round(c.value * 100) + "%" : "Unknown"} ·
                    weight {c.weight}
                  </span>
                </div>
                <div className="meter">
                  <span
                    style={{ width: c.known ? c.value * 100 + "%" : "0%" }}
                  />
                </div>
                <p>{c.evidence}</p>
              </div>
            ))}
            <h3>Profile terms not found</h3>
            <p className="muted">
              {j.match.missing.join(", ") || "None recorded."} Absence in text
              does not confirm a missing requirement.
            </p>
            <h3>Eligibility remains unknown</h3>
            <p className="muted">{j.match.uncertain.join(" · ")}</p>
          </>
        )}
        {tab === "Notes" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onUpdate({
                saved: true,
                notes,
                tags: tags
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
            }}
          >
            <label className="field">
              Your notes
              <textarea
                rows={8}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What stands out? What would you like to ask?"
              />
            </label>
            <label className="field">
              Tags, separated by commas
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Priority, portfolio fit…"
              />
            </label>
            <button className="primary">
              <Check size={15} />
              Save notes & bookmark
            </button>
          </form>
        )}
        {tab === "Track" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onTrack(app);
            }}
          >
            <label className="field">
              Application status
              <select
                value={app.status}
                onChange={(e) => setApp({ ...app, status: e.target.value })}
              >
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Application URL
              <input
                type="url"
                value={app.url || ""}
                onChange={(e) =>
                  setApp({ ...app, url: e.target.value || null })
                }
                placeholder={links[0]?.url || "https://…"}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Applied date
                <input
                  type="date"
                  value={app.appliedAt?.slice(0, 10) || ""}
                  onChange={(e) =>
                    setApp({
                      ...app,
                      appliedAt: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    })
                  }
                />
              </label>
              <label className="field">
                Follow-up date
                <input
                  type="date"
                  value={app.followUpAt?.slice(0, 10) || ""}
                  onChange={(e) =>
                    setApp({
                      ...app,
                      followUpAt: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    })
                  }
                />
              </label>
            </div>
            <label className="field">
              Application notes
              <textarea
                rows={4}
                value={app.notes}
                onChange={(e) => setApp({ ...app, notes: e.target.value })}
              />
            </label>
            <button className="primary">
              <Check size={15} />
              Update application
            </button>
            <p className="muted">
              Dates are personal reminders only. No notifications or messages
              are sent.
            </p>
            <h3>Status history</h3>
            {j.application?.events.map((event) => (
              <div className="history" key={event.id}>
                <span>{event.status}</span>
                <small>{date(event.createdAt)}</small>
              </div>
            )) || (
              <p className="muted">
                Your first status update will appear here.
              </p>
            )}
          </form>
        )}
      </div>
      <div className="detail-footer">
        <button
          className="text-button"
          onClick={() => void onUpdate({ hidden: !j.hidden })}
        >
          <EyeOff size={15} />
          {j.hidden ? "Restore this job" : "Hide this job"}
        </button>
        <span>Stored in your workspace</span>
      </div>
    </section>
  );
}
