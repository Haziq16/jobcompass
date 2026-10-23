"use client";
import { applicationTaskLabel } from "@/lib/application-progress";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  SlidersHorizontal,
  RotateCcw,
  List,
  Search,
  X,
} from "lucide-react";
import { api, useResource } from "./client";
import MatchPreferences from "./MatchPreferences";
import MatchCard, { MatchDetails } from "./MatchCard";
import { passReasons } from "@/lib/match-contracts";
import type {
  MatchListing,
  MatchSettings,
  MatchCollection,
  MatchRow,
} from "./match-types";
import { usePersonalAi } from "./PersonalAiContext";
import { useMatchAccess } from "./MatchAccess";
type Deck = { jobs: MatchListing[]; total: number };
const errorText = (e: unknown) => {
  const text = (e as Error).message;
  if (text === "application_consent_stale")
    return "Your CV, profile or processing rules changed. Refresh the deck before authorising this application.";
  return text === "revision_conflict"
    ? "This changed in another tab. Reload to use the latest version."
    : text === "listing_unavailable"
      ? "This listing is no longer confirmed available. Reload to continue."
      : "Could not save your change. Your current job is still here. Try again.";
};
function Deck({
  onChange,
  onUndo,
  canUndo,
  onDecided,
  revision,
  onPreferences,
}: {
  onChange: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onDecided: (id: string, message: string) => void;
  revision: number;
  onPreferences: () => void;
}) {
  const params = useSearchParams(),
    router = useRouter();
  const resource = useResource<Deck>(`matches/deck?${params.toString()}`);
  const refreshDeck = resource.refresh;
  const [hidden, setHidden] = useState<string[]>([]),
    [selected, setSelected] = useState<MatchListing | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{ key: string; id: string } | null>(null);
  const jobs = (resource.data?.jobs || []).filter(
    (j) => !hidden.includes(j.id),
  );
  const job = jobs[0];
  const [reason, setReason] = useState<(typeof passReasons)[number] | null>(
    null,
  );
  const prevRevision = useRef(revision);
  useEffect(() => {
    if (prevRevision.current !== revision) {
      prevRevision.current = revision;
      setHidden([]);
      refreshDeck();
    }
  }, [revision, refreshDeck]);
  async function decide(state: "queued" | "saved" | "passed", target = job) {
    if (!target || busy || resource.loading) return;
    setBusy(true);
    setError("");
    const key =
      target.id + ":" + state + ":" + (state === "passed" ? reason : "");
    if (pending.current?.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    try {
      const result = await api<{
        actionId: string;
        processing?: { enqueued: boolean; state?: string };
      }>("matches/decision", "POST", {
        requestId: pending.current.id,
        catalogId: target.id,
        state,
        reason: state === "passed" ? reason : null,
        expectedRevision: target.decisionRevision,
        ...(state === "queued" && target.applicationConsent
          ? { applicationConsent: target.applicationConsent.token }
          : {}),
      });
      pending.current = null;
      setHidden((v) => [...v, target.id]);
      setSelected(null);
      onDecided(
        result.actionId,
        state === "queued"
          ? target.applicationConsent
            ? result.processing?.enqueued &&
              (!result.processing.state || result.processing.state === "queued")
              ? `Authorised ${target.employer}. Automatic processing queued; follow progress in Automatic applications.`
              : `Authorised ${target.employer}. Review this application's current status before continuing; it was not automatically restarted.`
            : `Queued ${target.title} for review only. Automatic processing was not started. Open the application to check eligibility and form support.`
          : state === "saved"
            ? `Saved ${target.title} for later.`
            : `Passed ${target.title}.`,
      );
      setReason(null);
      onChange();
      if (jobs.length <= 1) resource.refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function search(form: FormData) {
    const next = new URLSearchParams(params);
    for (const key of ["q", "location", "remote"]) {
      const value = String(form.get(key) || "");
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace("/discover?" + next.toString(), { scroll: false });
  }
  return (
    <>
      <form
        className="match-search"
        onSubmit={(e) => {
          e.preventDefault();
          search(new FormData(e.currentTarget));
        }}
      >
        <label>
          <span>Search within your matches</span>
          <input
            name="q"
            defaultValue={params.get("q") || ""}
            placeholder="Role, skill or company"
          />
        </label>
        <label>
          <span>Location</span>
          <input
            name="location"
            defaultValue={params.get("location") || ""}
            placeholder="Any location"
          />
        </label>
        <button type="submit">
          <Search size={17} />
          Search
        </button>
        <button type="button" onClick={() => router.replace("/discover")}>
          Clear
        </button>
      </form>
      <div className="match-layout">
        <div>
          {error && (
            <div role="alert" className="match-error">
              <p>{error}</p>
              <button
                onClick={() => {
                  setError("");
                  resource.refresh();
                }}
              >
                Reload matches
              </button>
            </div>
          )}
          {resource.error ? (
            <div className="match-empty" role="alert">
              <h2>We couldn’t load your matches</h2>
              <p>Your queue and saved decisions are still available.</p>
              <button onClick={resource.refresh}>Retry matches</button>
            </div>
          ) : resource.loading ? (
            <div className="match-loading" role="status">
              <div />
              <h2>Finding your next opportunity…</h2>
              <p>Checking your preferences against employer listings.</p>
            </div>
          ) : job ? (
            <MatchCard
              job={job}
              nextTitle={jobs[1]?.title}
              busy={busy}
              onDecision={(state) => void decide(state)}
              onDetails={() => setSelected(job)}
              onUndo={onUndo}
              canUndo={canUndo}
            />
          ) : (
            <div className="match-empty">
              <Check size={30} />
              <h2>
                {resource.data?.total
                  ? "You’ve finished this batch"
                  : "No suitable jobs in this deck"}
              </h2>
              <p>
                {resource.data?.total
                  ? "Your decisions are saved. Load another batch to keep exploring."
                  : "Your strict preferences or search may exclude the available listings. We won’t fill the deck with unrelated jobs."}
              </p>
              <div>
                <button
                  className="primary"
                  onClick={() => {
                    setHidden([]);
                    resource.refresh();
                  }}
                >
                  Check for more jobs
                </button>
                <button onClick={onPreferences}>Adjust preferences</button>
                {canUndo && (
                  <button onClick={onUndo}>Undo last decision</button>
                )}
              </div>
              <Link href="/queue">View application queue</Link>
            </div>
          )}
        </div>
        <aside className="match-side-panel">
          <h2>Your next move</h2>
          <p>
            Swipe right to queue a role. Swipe left to pass. You stay in control
            of what happens next.
          </p>
          <Link className="match-queue-link" href="/queue">
            Open application queue
            <ArrowRight size={17} />
          </Link>
          <section>
            <h3>Optional reason for your next pass</h3>
            <p>
              Specific feedback helps reorder future matches. A pass alone only
              hides this listing.
            </p>
            <label>
              Pass reason
              <select
                aria-label="Pass reason"
                value={reason || ""}
                onChange={(e) => setReason(e.target.value as typeof reason)}
                disabled={busy}
              >
                <option value="">No reason</option>
                {passReasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          </section>
          <section>
            <h3>How matching works</h3>
            <p>
              Target roles and skill mentions lead. Location and recency
              contribute. Explicit employer, role and location feedback gently
              lowers similar matches.
            </p>
            <p>
              Salary and eligibility gaps remain visible. There is no
              interview-probability score.
            </p>
            <button onClick={onPreferences}>
              <SlidersHorizontal size={16} />
              Matching preferences
            </button>
          </section>
          {resource.data && (
            <p className="match-count">
              {Math.max(
                0,
                resource.data.total - hidden.length,
              ).toLocaleString()}{" "}
              undecided listings match these settings.
            </p>
          )}
        </aside>
      </div>
      {selected && (
        <MatchDetails
          job={selected}
          onClose={() => setSelected(null)}
          onQueue={() => void decide("queued", selected)}
          onSave={() => void decide("saved", selected)}
          busy={busy}
        />
      )}
    </>
  );
}
function Collection({
  data,
  loading,
  error,
  onRefresh,
  onDecided,
}: {
  data: MatchCollection | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onDecided: (id: string, message: string) => void;
}) {
  const { enabled: ai } = usePersonalAi();
  const params = useSearchParams(),
    router = useRouter();
  const [busy, setBusy] = useState<string | null>(null),
    [failure, setFailure] = useState(""),
    [selected, setSelected] = useState<MatchRow | null>(null),
    [confirm, setConfirm] = useState<MatchRow | null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const state = params.get("state") || "queued";
  const requests = useRef(new Map<string, string>());
  useEffect(() => {
    if (confirm) {
      confirmRef.current?.showModal();
    } else confirmRef.current?.close();
  }, [confirm]);
  async function change(
    row: MatchRow,
    next: "queued" | "saved" | "passed" | "removed",
  ) {
    setBusy(row.id);
    setFailure("");
    const key = row.id + ":" + row.revision + ":" + next;
    const requestId = requests.current.get(key) || crypto.randomUUID();
    requests.current.set(key, requestId);
    try {
      const result = await api<{ actionId: string }>(
        "matches/decision",
        "POST",
        {
          requestId,
          catalogId: row.catalogId,
          state: next,
          reason: null,
          expectedRevision: row.revision,
        },
      );
      requests.current.delete(key);
      onDecided(
        result.actionId,
        next === "queued"
          ? "Added to application queue. Nothing submitted."
          : next === "saved"
            ? "Moved to saved for later."
            : next === "passed"
              ? "Passed this listing."
              : "Removed from this collection.",
      );
      onRefresh();
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  async function priority(row: MatchRow, value: number) {
    setBusy(row.id);
    setFailure("");
    try {
      await api("matches/priority", "POST", {
        id: row.id,
        priority: value,
        expectedRevision: row.revision,
      });
      onRefresh();
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  async function application(
    row: MatchRow,
    action: "prepare" | "confirm_submission",
  ) {
    setBusy(row.id);
    setFailure("");
    try {
      await api("matches/application", "POST", { id: row.id, action });
      setConfirm(null);
      onRefresh();
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  function page(n: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(n));
    router.replace("/queue?" + next.toString(), { scroll: false });
  }
  return (
    <>
      <nav className="match-collection-tabs" aria-label="Your job decisions">
        {[
          ["queued", "Application queue"],
          ["saved", "Saved for later"],
          ["passed", "Passed"],
          ["removed", "Removed"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={"/queue?state=" + key}
            aria-current={state === key ? "page" : undefined}
          >
            {label}
            <span>{data?.counts[key] || 0}</span>
          </Link>
        ))}
      </nav>
      {state === "queued" && (
        <p className="match-context-note">
          Your interested jobs, ready for your next step. Nothing is
          automatically submitted. Opening an employer page does not mark a job
          applied.
        </p>
      )}
      {(failure || error) && (
        <div role="alert" className="match-error">
          <p>{failure || "Could not load your decisions."}</p>
          <button onClick={onRefresh}>Reload collection</button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading your saved decisions…</p>
      ) : !data?.rows.length ? (
        <div className="match-empty">
          <Bookmark size={28} />
          <h2>
            {state === "queued"
              ? "Your next move starts with a right swipe"
              : "No jobs here yet"}
          </h2>
          <p>
            {state === "queued"
              ? "Interested jobs will appear here, with priorities and links to prepare your application."
              : "Your decisions are saved privately in the collection you choose."}
          </p>
          <Link href="/discover">
            Discover your matches
            <ArrowRight size={17} />
          </Link>
        </div>
      ) : (
        <div className="match-queue-list" aria-busy={Boolean(busy)}>
          {data.rows.map((row) => (
            <article key={row.id} className="match-queue-row">
              <div className="match-queue-copy">
                <p>{row.snapshot.employer}</p>
                <h2>
                  <button onClick={() => setSelected(row)}>
                    {row.snapshot.title}
                  </button>
                </h2>
                <p>
                  {row.snapshot.location || "Location not supplied"}
                  {row.snapshot.salaryText
                    ? " · " + row.snapshot.salaryText
                    : ""}
                </p>
                <div className="match-row-status">
                  <span>
                    {row.application?.status === "Applied"
                      ? "Applied"
                      : row.processing
                        ? applicationTaskLabel(row.processing.state)
                        : row.state === "queued"
                          ? row.automaticSupported === false
                            ? "Manual application: unsupported form"
                            : "Queued for review; automatic authorization required"
                          : row.state === "saved"
                            ? "Saved for later"
                            : row.state === "passed"
                              ? "Passed"
                              : "Removed"}
                  </span>
                  {!row.available && (
                    <span className="match-error-text">
                      Availability unconfirmed
                    </span>
                  )}
                  {row.reason && <span>Reason: {row.reason}</span>}
                </div>
                {row.processing?.detail && (
                  <p className="candidate-help">{row.processing.detail}</p>
                )}
              </div>
              <div className="match-queue-actions">
                {row.state === "queued" && (
                  <label>
                    Priority
                    <select
                      aria-label="Priority"
                      value={row.priority}
                      disabled={Boolean(busy) || loading}
                      onChange={(e) =>
                        void priority(row, Number(e.target.value))
                      }
                    >
                      <option value={0}>Normal</option>
                      <option value={1}>High</option>
                      <option value={2}>First</option>
                    </select>
                  </label>
                )}
                {row.state !== "queued" && (
                  <button
                    disabled={Boolean(busy) || !row.available}
                    onClick={() => void change(row, "queued")}
                  >
                    <Check size={16} />
                    Add to queue
                  </button>
                )}
                {row.state === "queued" && (
                  <>
                    <Link href={"/apply/" + row.catalogId}>
                      Review application &amp; continue
                    </Link>
                    <a
                      href={row.snapshot.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Employer posting
                      <ArrowUpRight size={15} />
                    </a>
                    {ai && (
                      <Link
                        href={
                          "/assistant?source=catalog&jobId=" + row.catalogId
                        }
                      >
                        Prepare CV
                      </Link>
                    )}
                    <Link
                      href={
                        "/application-profile?tab=inbox&job=" + row.catalogId
                      }
                    >
                      Application answers
                    </Link>
                    {!row.application && (
                      <button
                        disabled={Boolean(busy) || !row.available}
                        onClick={() => void application(row, "prepare")}
                      >
                        Start application tracker
                      </button>
                    )}
                    {row.application && (
                      <Link href={"/applications/" + row.application.id}>
                        View application
                      </Link>
                    )}
                    {(!row.application ||
                      ["Saved", "Preparing"].includes(
                        row.application.status,
                      )) && (
                      <button
                        disabled={Boolean(busy)}
                        onClick={() => setConfirm(row)}
                      >
                        Record my submission
                      </button>
                    )}
                  </>
                )}
                {row.state !== "saved" && (
                  <button
                    disabled={Boolean(busy)}
                    onClick={() => void change(row, "saved")}
                  >
                    Save for later
                  </button>
                )}
                {row.state !== "passed" && (
                  <button
                    disabled={Boolean(busy)}
                    onClick={() => void change(row, "passed")}
                  >
                    Pass
                  </button>
                )}
                {row.state !== "removed" && (
                  <button
                    disabled={Boolean(busy)}
                    onClick={() => void change(row, "removed")}
                    aria-label={"Remove " + row.snapshot.title}
                  >
                    <X size={16} />
                    Remove
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {data && data.total > 30 && (
        <nav className="match-pagination" aria-label="Decision pages">
          <button
            disabled={loading || data.page <= 1}
            onClick={() => page(data.page - 1)}
          >
            <ArrowLeft size={16} />
            Previous
          </button>
          <span>
            Page {data.page} of {Math.ceil(data.total / 30)}
          </span>
          <button
            disabled={loading || data.page * 30 >= data.total}
            onClick={() => page(data.page + 1)}
          >
            Next
            <ArrowRight size={16} />
          </button>
        </nav>
      )}
      {selected && (
        <MatchDetails
          job={{ ...selected.snapshot, id: selected.catalogId }}
          onClose={() => setSelected(null)}
          onQueue={
            selected.state !== "queued" && selected.available
              ? () =>
                  void change(selected, "queued").then(() => setSelected(null))
              : undefined
          }
          busy={Boolean(busy)}
        />
      )}
      <dialog
        className="match-dialog match-confirm"
        ref={confirmRef}
        onCancel={() => setConfirm(null)}
        aria-labelledby="match-confirm-title"
      >
        <h2 id="match-confirm-title">Did you submit this application?</h2>
        <p>
          Only confirm after submitting {confirm?.snapshot.title} on the
          employer’s website. JobCompass has not submitted it for you.
        </p>
        {failure && <p role="alert">{failure}</p>}
        <div className="match-detail-footer">
          <button onClick={() => setConfirm(null)} disabled={Boolean(busy)}>
            Not yet
          </button>
          <button
            className="primary"
            disabled={Boolean(busy)}
            onClick={() =>
              confirm && void application(confirm, "confirm_submission")
            }
          >
            Yes, I submitted it
          </button>
        </div>
      </dialog>
    </>
  );
}
function EnabledMatchWorkspace() {
  const pathname = usePathname(),
    params = useSearchParams(),
    router = useRouter();
  const isQueue = pathname === "/queue";
  useEffect(() => {
    if (isQueue) return;
    const check = () => {
      if (document.visibilityState === "visible")
        void api("catalog/refresh", "POST").catch(() => {});
    };
    check();
    const timer = setInterval(check, 300_000);
    return () => clearInterval(timer);
  }, [isQueue]);
  const settings = useResource<MatchSettings>("matches/settings");
  const state = ["queued", "saved", "passed", "removed"].includes(
    params.get("state") || "",
  )
    ? params.get("state")!
    : "queued";
  const collection = useResource<MatchCollection>(
    `matches/collection?state=${state}&page=${params.get("page") || "1"}`,
  );
  const refreshCollection = collection.refresh;
  useEffect(() => {
    if (!isQueue) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refreshCollection();
    }, 15000);
    return () => clearInterval(timer);
  }, [isQueue, refreshCollection]);
  const [setup, setSetup] = useState(false),
    [notice, setNotice] = useState(""),
    [failure, setFailure] = useState(""),
    [lastAction, setLastAction] = useState<string | null>(null),
    [revision, setRevision] = useState(0),
    [undoBusy, setUndoBusy] = useState(false);
  const action = lastAction || collection.data?.lastActionId || null;
  async function undo() {
    if (!action || undoBusy) return;
    setUndoBusy(true);
    setFailure("");
    try {
      await api("matches/undo", "POST", { actionId: action });
      setLastAction(null);
      setNotice(
        "Last decision undone. Your deck and collections have been updated.",
      );
      setRevision((v) => v + 1);
      collection.refresh();
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setUndoBusy(false);
    }
  }
  function decided(id: string, message: string) {
    setLastAction(id);
    setNotice(message);
    setFailure("");
  }
  async function reset() {
    setFailure("");
    try {
      await api("matches/reset-learning", "POST", {});
      setRevision((v) => v + 1);
      collection.refresh();
      setNotice(
        "Feedback influence reset. Your queue, saved jobs and passed listings are unchanged.",
      );
    } catch (e) {
      setFailure(errorText(e));
    }
  }
  const showSetup =
    !isQueue && (setup || Boolean(settings.data && !settings.data.preferences));
  return (
    <section className="match-workspace" aria-labelledby="match-page-title">
      <header className="match-page-heading">
        <div>
          <h1 id="match-page-title">
            {isQueue ? "Your application queue" : "Find your next move"}
          </h1>
          <p>
            {isQueue
              ? "Your choices, organised. Take the next step when you’re ready."
              : "Relevant opportunities. One card at a time."}
          </p>
        </div>
        <div className="match-view-switch" aria-label="Discovery views">
          <Link href="/discover" aria-current={!isQueue ? "page" : undefined}>
            Swipe
          </Link>
          <Link href="/discover?view=list">
            <List size={16} />
            List
          </Link>
          <Link href="/queue" aria-current={isQueue ? "page" : undefined}>
            Queue <span>{collection.data?.counts.queued || 0}</span>
          </Link>
        </div>
      </header>
      <div className="match-toolbar">
        <span>
          Right swipe queues a job. Automatic processing follows your saved
          rules.
        </span>
        <Link href="/automation">Automatic application rules</Link>
        <div>
          {!isQueue && settings.data?.preferences && (
            <button onClick={() => setSetup(true)}>
              <SlidersHorizontal size={16} />
              Preferences
            </button>
          )}
          <button onClick={() => void undo()} disabled={!action || undoBusy}>
            <RotateCcw size={16} />
            {undoBusy ? "Undoing…" : "Undo last decision"}
          </button>
        </div>
      </div>
      <div className="match-live-region" role="status" aria-live="polite">
        {notice}
      </div>
      {failure && (
        <p role="alert" className="match-error">
          {failure}
        </p>
      )}
      {isQueue ? (
        <Collection
          data={collection.data}
          loading={collection.loading}
          error={collection.error}
          onRefresh={collection.refresh}
          onDecided={decided}
        />
      ) : settings.error ? (
        <div role="alert" className="match-empty">
          <h2>Could not load matching preferences</h2>
          <button onClick={settings.refresh}>Retry preferences</button>
        </div>
      ) : settings.loading ? (
        <p role="status">Loading your matching profile…</p>
      ) : showSetup && settings.data ? (
        <MatchPreferences
          key={settings.data.revision}
          settings={settings.data}
          onSaved={() => {
            setSetup(false);
            settings.refresh();
            setRevision((v) => v + 1);
            setNotice("Preferences saved. Your deck now uses these settings.");
          }}
          onCancel={() =>
            settings.data?.preferences
              ? setSetup(false)
              : router.push("/discover?view=list")
          }
        />
      ) : (
        <Deck
          key={settings.data?.revision}
          onChange={collection.refresh}
          onUndo={() => void undo()}
          canUndo={Boolean(action) && !undoBusy}
          onDecided={decided}
          revision={revision}
          onPreferences={() => setSetup(true)}
        />
      )}
      {!isQueue && settings.data?.preferences && !showSetup && (
        <details className="match-learning-settings">
          <summary>Your matching preferences and feedback</summary>
          <p>
            Strict rules:{" "}
            {[
              settings.data.preferences.roleStrict ? "target titles" : null,
              settings.data.preferences.locationStrict ? "locations" : null,
              settings.data.preferences.arrangementStrict
                ? "work arrangement"
                : null,
              settings.data.preferences.salaryStrict
                ? "comparable salary"
                : null,
            ]
              .filter(Boolean)
              .join(", ") || "none"}
            .{" "}
            {settings.data.preferences.allowUnknown
              ? "Missing details stay visible."
              : "Missing details for selected strict filters are excluded."}
          </p>
          <p>
            Only explicit Employer, Wrong role and Location pass reasons
            influence ranking. Other reasons remain in your history. A swipe
            alone does not change your preferences.
          </p>
          <div>
            <button onClick={() => setSetup(true)}>Edit preferences</button>
            <button onClick={() => void reset()}>
              Reset feedback influence
            </button>
            <Link href="/queue?state=passed">Inspect passed jobs</Link>
          </div>
        </details>
      )}
    </section>
  );
}

export default function MatchWorkspace() {
  const enabled = useMatchAccess();
  return enabled ? (
    <EnabledMatchWorkspace />
  ) : (
    <section>
      <h1>Swipe matching is in private preview</h1>
      <p>Your existing discovery and saved jobs are available.</p>
      <Link href="/discover">Explore jobs</Link>
    </section>
  );
}
