"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Pause, RefreshCw, Play, Check } from "lucide-react";
import { api, useResource } from "./client";
import { useMatchAccess } from "./MatchAccess";
import type { automationOverview } from "@/lib/automation";
type Overview = Awaited<ReturnType<typeof automationOverview>>;
type Values = Overview["settings"];
const errorMessage = (e: unknown) =>
  (
    ({
      worker_not_configured:
        "The offline worker connection has not been configured yet.",
      confirmed_contact_required:
        "Confirm Contact in your application profile first.",
      revision_conflict:
        "These settings changed in another tab. Reload before saving.",
      submission_requires_resolution:
        "Check and resolve the earlier submission outcome before retrying.",
      automation_paused: "Enable processing before retrying a task.",
    }) as Record<string, string>
  )[(e as Error).message] ||
  "Could not save this change. Your entries are still here.";
export default function Autopilot() {
  return useMatchAccess() ? (
    <Workspace />
  ) : (
    <section>
      <h1>Automatic applications</h1>
      <p>This feature is currently available to the owner only.</p>
    </section>
  );
}
function Settings({
  data,
  onSaved,
  onNotice,
}: {
  data: Overview;
  onSaved: () => void;
  onNotice: (s: string) => void;
}) {
  const [v, setV] = useState<Values>(data.settings),
    [confirmed, setConfirmed] = useState(false),
    [existing, setExisting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function change(key: keyof Values, value: unknown) {
    setV((old) => ({ ...old, [key]: value }));
    setConfirmed(false);
  }
  async function save() {
    if (v.enabled && !confirmed) {
      setError("Confirm the application rules before enabling processing.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("automation/settings", "POST", {
        values: { ...v, consent: true },
        expectedRevision: data.revision,
        includeExisting: existing,
      });
      onSaved();
      onNotice(
        v.enabled
          ? "Automatic queue processing enabled. Only authorised queued jobs will be processed."
          : "Automatic queue processing paused.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="autopilot-settings">
      <h2>Your application rules</h2>
      <p>
        New right swipes can enter the offline queue. We do not apply to the
        catalogue indiscriminately.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="candidate-checkbox">
          <input
            type="checkbox"
            checked={v.enabled}
            onChange={(e) => change("enabled", e.target.checked)}
          />
          Enable offline processing for future jobs I queue
        </label>
        <div className="candidate-fields">
          <label>
            Default CV
            <select
              aria-label="Default CV"
              value={v.resumeAssetId}
              onChange={(e) => change("resumeAssetId", e.target.value)}
              required
            >
              <option value="">Choose a saved original CV</option>
              {data.resumes.map((r) => (
                <option value={r.id} key={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fallback hiring country
            <input
              aria-label="Fallback hiring country"
              value={v.country}
              onChange={(e) => change("country", e.target.value)}
              required
            />
            <small>
              Used only when the listing has no country. A conflicting
              eligibility question pauses the application.
            </small>
          </label>
          <label>
            Daily task limit (UTC)
            <input
              aria-label="Daily task limit (UTC)"
              type="number"
              min={1}
              max={20}
              value={v.dailyLimit}
              onChange={(e) => change("dailyLimit", Number(e.target.value))}
            />
          </label>
          <label>
            Monthly worker task limit (UTC)
            <input
              aria-label="Monthly worker task limit (UTC)"
              type="number"
              min={1}
              max={60}
              value={v.monthlyLimit}
              onChange={(e) => change("monthlyLimit", Number(e.target.value))}
            />
            <small>
              Limits include interrupted pre-submission attempts. GitHub runner
              minutes use your existing allowance.
            </small>
          </label>
        </div>
        <fieldset>
          <legend>Supported platforms</legend>
          <div className="autopilot-platforms">
            {["greenhouse", "lever", "ashby"].map((p) => (
              <label className="candidate-checkbox" key={p}>
                <input
                  type="checkbox"
                  checked={v.platforms.includes(p)}
                  onChange={(e) =>
                    change(
                      "platforms",
                      e.target.checked
                        ? [...v.platforms, p]
                        : v.platforms.filter((x) => x !== p),
                    )
                  }
                />
                {p === "greenhouse"
                  ? "Greenhouse"
                  : p === "lever"
                    ? "Lever"
                    : "Ashby"}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="candidate-checkbox">
          <input
            type="checkbox"
            checked={v.submit}
            onChange={(e) => change("submit", e.target.checked)}
          />
          Submit eligible applications automatically after the form and CV pass
          checks
        </label>
        <p className="candidate-help">
          Unchecked means fill only. Consent checkboxes, login, CAPTCHA and
          unsupported questions still need you. A click without a reliable
          employer receipt stays uncertain and is never automatically retried.
        </p>
        <label className="candidate-checkbox">
          <input
            type="checkbox"
            checked={existing}
            onChange={(e) => {
              setExisting(e.target.checked);
              setConfirmed(false);
            }}
          />
          Also add up to 200 previously authorised jobs from my application
          queue
        </label>
        <label className="candidate-checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I authorise these rules for jobs I deliberately queue, using my
          confirmed profile, selected CV and saved answers. I have checked the
          fallback country.
        </label>
        {error && (
          <p className="candidate-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary"
          disabled={busy || (v.enabled && !confirmed) || !data.workerConfigured}
          type="submit"
        >
          {busy ? "Saving…" : "Save application rules"}
        </button>
      </form>
    </section>
  );
}
function Workspace() {
  const resource = useResource<Overview>("automation/overview"),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = resource.refresh;
  useEffect(() => {
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function pause() {
    if (!resource.data) return;
    setBusy(true);
    try {
      await api("automation/settings", "POST", {
        values: { ...resource.data.settings, enabled: false, consent: true },
        expectedRevision: resource.data.revision,
      });
      refresh();
      setNotice(
        "Processing paused. Unsent work is cancelled; already-started submissions still need outcome checks.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function retry(id: string) {
    setError("");
    try {
      await api("automation/retry", "POST", { id });
      refresh();
      setNotice("Task returned to the offline queue.");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function resolve(id: string, revision: number, submitted: boolean) {
    if (
      !window.confirm(
        submitted
          ? "Confirm that you checked the employer and this application was submitted."
          : "Confirm that you checked the employer and no application was submitted. Only then can a retry be allowed.",
      )
    )
      return;
    try {
      await api("automation/resolve", "POST", {
        id,
        revision,
        submitted,
        checked: true,
      });
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div className="candidate-workspace autopilot-workspace">
      <header className="fill-heading">
        <div>
          <h1>Automatic applications</h1>
          <p>
            Apply to your queued jobs while your browser and computer are
            closed.
          </p>
        </div>
        <Link href="/queue">Open application queue</Link>
      </header>
      {notice && (
        <p className="candidate-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="candidate-error" role="alert">
          {error}
        </p>
      )}
      {resource.error ? (
        <div role="alert">
          <p>
            Could not load automatic applications. This feature is owner-only.
          </p>
          <button onClick={refresh}>Try again</button>
        </div>
      ) : !resource.data ? (
        <p role="status">Loading your private automation settings…</p>
      ) : (
        <>
          <div className="autopilot-status">
            <p>
              <strong>
                {resource.data.settings.enabled
                  ? "Processing enabled"
                  : "Processing paused"}
              </strong>
              <br />
              {resource.data.schedule}
            </p>
            <div className="candidate-inline-actions">
              <button onClick={refresh}>
                <RefreshCw size={16} />
                Refresh
              </button>
              {resource.data.settings.enabled && (
                <button onClick={() => void pause()} disabled={busy}>
                  <Pause size={16} />
                  Pause processing
                </button>
              )}
            </div>
          </div>
          {!resource.data.workerConfigured && (
            <p className="candidate-error">
              Offline worker configuration is missing. Processing cannot be
              enabled yet.
            </p>
          )}
          <div className="autopilot-layout">
            <Settings
              key={resource.data.revision}
              data={resource.data}
              onSaved={refresh}
              onNotice={setNotice}
            />
            <section className="autopilot-notifications">
              <div className="candidate-heading-row">
                <h2>Notifications</h2>
                <button
                  onClick={() =>
                    void api("automation/seen", "POST", {}).then(refresh)
                  }
                >
                  <Check size={15} />
                  Mark read
                </button>
              </div>
              <p className="candidate-help">
                Results and missing-input alerts stay here while you are away.
                Email notifications are not configured.
              </p>
              {resource.data.events.length ? (
                resource.data.events.slice(0, 4).map((e) => (
                  <article key={e.id} data-unread={!e.seenAt}>
                    <p>{e.message}</p>
                    <small>
                      {new Date(String(e.createdAt)).toLocaleString()}
                    </small>
                  </article>
                ))
              ) : (
                <p>No processing events yet.</p>
              )}
            </section>
          </div>
          <section className="autopilot-tasks">
            <h2>Recent processing tasks</h2>
            <p className="candidate-help">
              Latest 50 tasks. Confirmed means an employer receipt or your
              explicit outcome confirmation; uncertain outcomes require
              resolution.
            </p>
            {resource.data.tasks.length ? (
              resource.data.tasks.map((t) => {
                const submission = resource.data!.submissions.find(
                  (s) => s.catalogId === t.catalogId,
                );
                return (
                  <article key={t.id}>
                    <div>
                      <p className="autopilot-state">
                        {t.state.replaceAll("_", " ")}
                      </p>
                      <h3>{t.title}</h3>
                      <p>
                        {t.employer} · {t.country} ·{" "}
                        {t.submit
                          ? "Automatic submission authorised"
                          : "Fill only"}
                      </p>
                      {t.detail && <p className="candidate-help">{t.detail}</p>}
                    </div>
                    <div className="candidate-inline-actions">
                      <Link href={"/apply/" + t.catalogId}>
                        Open application
                      </Link>
                      <Link
                        href={
                          "/application-profile?tab=inbox&job=" + t.catalogId
                        }
                      >
                        Answer inbox
                      </Link>
                      {[
                        "needs_input",
                        "failed",
                        "filled",
                        "cancelled",
                      ].includes(t.state) &&
                        (!submission ||
                          submission.state === "resolved_not_submitted") && (
                          <button
                            disabled={!resource.data!.settings.enabled}
                            onClick={() => void retry(t.id)}
                          >
                            <Play size={15} />
                            Retry preparation
                          </button>
                        )}
                      {submission &&
                        ["uncertain", "failed"].includes(submission.state) && (
                          <>
                            <button
                              onClick={() =>
                                void resolve(
                                  submission.id,
                                  submission.revision,
                                  true,
                                )
                              }
                            >
                              I verified it was submitted
                            </button>
                            <button
                              onClick={() =>
                                void resolve(
                                  submission.id,
                                  submission.revision,
                                  false,
                                )
                              }
                            >
                              I verified no submission
                            </button>
                          </>
                        )}
                    </div>
                  </article>
                );
              })
            ) : (
              <p>
                No automatic tasks yet. Configure your rules, then queue a job
                or explicitly include existing queued jobs.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
