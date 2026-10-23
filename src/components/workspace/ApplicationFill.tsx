"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, ArrowUpRight, RefreshCw } from "lucide-react";
import { api, useResource } from "./client";
import { useMatchAccess } from "./MatchAccess";
import type { fillSetup, startFill } from "@/lib/application-filling";
import ApplicationRecovery from "./ApplicationRecovery";
import { applicationProgress } from "@/lib/application-progress";
type Setup = Awaited<ReturnType<typeof fillSetup>>;
type Grant = Awaited<ReturnType<typeof startFill>>;
type ExtensionResponse = { ok?: boolean; version?: string; error?: string };
function connect(id: string, message: unknown) {
  return new Promise<ExtensionResponse>((resolve, reject) => {
    const runtime = (
      window as unknown as {
        chrome?: {
          runtime?: {
            sendMessage: (
              id: string,
              message: unknown,
              callback: (r: ExtensionResponse) => void,
            ) => void;
            lastError?: { message?: string };
          };
        };
      }
    ).chrome?.runtime;
    if (!runtime) {
      reject(new Error("companion_missing"));
      return;
    }
    const timer = setTimeout(
      () => reject(new Error("companion_missing")),
      5000,
    );
    try {
      runtime.sendMessage(id, message, (result) => {
        clearTimeout(timer);
        if (runtime.lastError || !result?.ok) {
          reject(new Error(result?.error || "companion_missing"));
          return;
        }
        resolve(result);
      });
    } catch {
      clearTimeout(timer);
      reject(new Error("companion_missing"));
    }
  });
}
const errors: Record<string, string> = {
  cv_under_2mb_required:
    "Choose an original PDF or DOCX of 2 MB or less for automatic upload. Larger CVs can be attached manually on the employer page.",
  companion_missing:
    "Install or reload JobCompass Companion 2.1.0 in Chrome, then try again. No filling was started.",
  confirmed_contact_required:
    "Confirm the Contact section in your application profile first.",
  listing_unavailable:
    "This listing is closed, stale or its destination changed. Refresh discovery before continuing.",
  queue_required: "Add this job to your queue before connecting.",
  profile_changed:
    "Your profile changed. Confirm it and start a fresh connection.",
  unsupported_form:
    "This application platform is not supported yet. Use the employer posting to apply manually.",
  submission_requires_resolution:
    "An application attempt is already recorded. Check its outcome in Automatic applications before opening another form.",
  revision_conflict:"This application changed in another tab. Refresh before authorizing it again.",
  recipient_authorization_required:"Your CV or profile changed. Review and authorize the current details for this employer.",
  automation_paused:"Automatic processing is paused. Enable your application rules before resuming.",
  eligibility_confirmation_required:
    "Confirm the employer's eligibility requirements in this job's answer inbox before authorizing processing.",
  eligibility_conflict:
    "A confirmed fact conflicts with an employer requirement. Review this job's eligibility before continuing.",
  application_consent_stale:
    "Your CV, profile or rules changed. Refresh this page and authorize the current details.",
};
export default function ApplicationFill({ catalogId }: { catalogId: string }) {
  const allowed = useMatchAccess();
  return allowed ? (
    <Workspace catalogId={catalogId} />
  ) : (
    <section>
      <h1>Application filling</h1>
      <p>This feature is currently an owner preview.</p>
      <Link href="/discover">Back to discovery</Link>
    </section>
  );
}
function Workspace({ catalogId }: { catalogId: string }) {
  const resource = useResource<Setup>(
      "application-fill/setup?job=" + catalogId,
    ),
    [resume, setResume] = useState(""),
    [country, setCountry] = useState(""),
    [consent, setConsent] = useState(false),
    [submit, setSubmit] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const data = resource.data,
    latest = data?.sessions[0];
  const authorization = useResource<{
    applicationConsent: {
      token: string;
      cvName: string;
      submit: boolean;
      recipient: string;
    } | null;
  }>("automation/consent?job=" + catalogId);
  async function authorizeAutomatic() {
    if (!data || !authorization.data?.applicationConsent) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        processing?: { id?: string; state?: string };
      }>("matches/decision", "POST", {
        requestId: crypto.randomUUID(),
        catalogId,
        state: "queued",
        expectedRevision: data.decision.revision,
        applicationConsent: authorization.data.applicationConsent.token,
      });
      if (
        result.processing?.id &&
        ["needs_input", "failed", "filled", "cancelled"].includes(
          result.processing.state || "",
        )
      )
        await api("automation/retry", "POST", { id: result.processing.id });
      setNotice(
        "This employer is authorized to receive the shown CV and confirmed answers. Check Automatic applications for progress.",
      );
      refresh();
      authorization.refresh();
    } catch (e) {
      setError(errors[(e as Error).message] || (e as Error).message);
      refresh();
      authorization.refresh();
    } finally {
      setBusy(false);
    }
  }
  const active =
    latest &&
    !latest.revokedAt &&
    new Date(String(latest.expiresAt)).valueOf() > Date.now();
  const refresh = resource.refresh;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [active, refresh]);
  async function start() {
    if (!data) return;
    setBusy(true);
    setError("");
    let grant: Grant | null = null;
    try {
      const extension = await connect(data.companionId, { action: "jc-ping" });
      if (extension.version !== "2.1.0") throw new Error("companion_missing");
      grant = await api<Grant>("application-fill/start", "POST", {
        catalogId,
        resumeAssetId: resume || data.resumes[0]?.id,
        country: country || data.country,
        consent,
        submit,
      });
      await connect(data.companionId, { action: "jc-connect-fill", ...grant });
      setNotice(
        "Employer form opened in the companion. Return here for its latest report. Only a separately authorised submission can be sent.",
      );
      setConsent(false);
      refresh();
    } catch (e) {
      if (grant)
        await api("application-fill/revoke", "POST", { id: grant.id }).catch(
          () => {},
        );
      setError(errors[(e as Error).message] || (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    if (!latest) return;
    setBusy(true);
    try {
      await api("application-fill/revoke", "POST", { id: latest.id });
      refresh();
      setNotice(
        "Connection revoked. Open employer-form values are not erased.",
      );
    } catch {
      setError("Could not revoke this connection. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const progress = applicationProgress(latest?.report);
  return (
    <section className="candidate-workspace fill-workspace">
      <header className="fill-heading">
        <div>
          <Link href="/queue">Back to application queue</Link>
          <h1>Fill application</h1>
          <p>
            {data?.decision.title || "Your queued job"}
            {data?.decision.employer ? " · " + data.decision.employer : ""}
          </p>
        </div>
        <Link href="/application-profile">Edit application profile</Link>
      </header>
      {resource.error ? (
        <div role="alert" className="candidate-error">
          <p>
            Could not load this queued application.{" "}
            {resource.error === "filling_unavailable"
              ? "Application filling is currently disabled for this account."
              : ""}
          </p>
          <button onClick={refresh}>Try again</button>
        </div>
      ) : !data ? (
        <p role="status">Loading your private application setup…</p>
      ) : (
        <>
          <p className="fill-intro">
            Use confirmed facts and your selected CV on the employer form.
            Missing answers return to your inbox; existing entries are
            preserved. Submission requires your explicit authorisation.
          </p>
          {data.readiness && (
            <section className="application-readiness">
              <h2>{data.readiness.label}</h2>
              <p>{data.readiness.action}</p>
              <ul>
                {data.readiness.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <Link href={"/application-profile?tab=inbox&job=" + catalogId}>
                Check screening answers for this job
              </Link>
            </section>
          )}
          {data.submission &&
          data.submission.state !== "resolved_not_submitted" ? (
            <p role="status">
              An application attempt is already recorded:{" "}
              {data.submission.state}. Check the outcome in{" "}
              <Link href="/automation">Automatic applications</Link> before
              another attempt.
            </p>
          ) : (
            authorization.data?.applicationConsent && (
              <section className="application-authorization">
                <h2>Start automatic processing</h2>
                <p>
                  Authorize sending{" "}
                  <strong>
                    {authorization.data.applicationConsent.cvName}
                  </strong>
                  , your confirmed contact details and application answers to{" "}
                  <strong>{data.decision.employer}</strong>
                  {authorization.data.applicationConsent.submit
                    ? ", including final submission when all checks pass."
                    : " to fill the form only."}{" "}
                  Missing facts and human verification pause processing.
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void authorizeAutomatic()}
                >
                  {busy
                    ? "Saving authorization..."
                    : "Authorize & process this application"}
                </button>
              </section>
            )
          )}
          <div className="fill-layout">
            <div>
              <section className="fill-setup">
                <h2>Connect this application</h2>
                <p className="candidate-help">
                  Continue on supported Greenhouse, Lever and Ashby forms in
                  desktop Chrome. Use this for employer consent, human
                  verification or controls that need your input. A new
                  connection refills a fresh employer tab from confirmed facts;
                  it does not restore the closed background tab.
                </p>
                {!data.supported && (
                  <p role="status" className="candidate-error">
                    This employer uses an unsupported application page.{" "}
                    <a
                      href={data.decision.targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open employer posting
                    </a>{" "}
                    to apply manually.
                  </p>
                )}
                {!data.profileReady && (
                  <p className="candidate-notice">
                    Confirm your{" "}
                    <Link href="/application-profile">Contact details</Link>{" "}
                    before filling. Enter first and last names explicitly if the
                    employer asks for them separately.
                  </p>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void start();
                  }}
                >
                  <label>
                    CV to attach
                    <select
                      aria-label="CV to attach"
                      value={resume || data.resumes[0]?.id || ""}
                      onChange={(e) => {
                        setResume(e.target.value);
                        setConsent(false);
                      }}
                      required
                    >
                      <option value="" disabled>
                        Select a saved CV
                      </option>
                      {data.resumes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                          {r.isDefault ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                    <small>
                      The selected original PDF or DOCX (up to 2 MB) is uploaded
                      unchanged. To use a tailored version, download it and save
                      it as a CV first.
                    </small>
                  </label>
                  {!data.resumes.length && (
                    <p>
                      <Link href="/application-profile">
                        Upload a CV to your application profile
                      </Link>{" "}
                      to continue.
                    </p>
                  )}
                  <label>
                    Country where this job is based
                    <input
                      aria-label="Country where this job is based"
                      value={country || data.country}
                      onChange={(e) => {
                        setCountry(e.target.value);
                        setConsent(false);
                      }}
                      required
                      minLength={2}
                      maxLength={80}
                    />
                    <small>
                      This controls salary and work-eligibility answers. For a
                      remote job, enter the hiring country relevant to your
                      application.
                    </small>
                  </label>
                  <p className="candidate-help">
                    Destination:{" "}
                    <a
                      href={data.decision.targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {new URL(data.decision.targetUrl).hostname}
                      <ArrowUpRight size={13} />
                    </a>
                  </p>
                  <label className="candidate-checkbox">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      required
                    />
                    Use my confirmed profile and matching saved answers for this
                    employer, and upload the CV selected above.
                  </label>
                  <label className="candidate-checkbox">
                    <input
                      type="checkbox"
                      checked={submit}
                      onChange={(e) => {
                        setSubmit(e.target.checked);
                        setConsent(false);
                      }}
                    />
                    Submit this application automatically when its answers and
                    CV pass checks. Pause for missing input or CAPTCHA.
                  </label>
                  <button
                    className="primary"
                    type="submit"
                    disabled={
                      busy ||
                      !consent ||
                      !data.profileReady ||
                      !data.resumes.length ||
                      !data.supported ||
                      (Boolean(data.submission) &&
                        data.submission?.state !== "resolved_not_submitted") ||
                      data.decision.state !== "queued"
                    }
                  >
                    {busy ? "Connecting…" : "Connect and fill"}
                  </button>
                  <p className="candidate-help">
                    Connections expire after 30 minutes. A new connection
                    revokes the previous one for this job.
                  </p>
                </form>
                {error && (
                  <p role="alert" className="candidate-error">
                    {error}
                  </p>
                )}
                {notice && (
                  <p role="status" className="candidate-notice">
                    {notice}
                  </p>
                )}
              </section>
              <section className="fill-report">
                <div className="candidate-heading-row">
                  <h2>Employer form progress</h2>
                  <button onClick={refresh} disabled={resource.loading}>
                    <RefreshCw size={15} />
                    Refresh
                  </button>
                </div>
                {!latest ? (
                  <p>
                    No connected form yet. Start above to read and fill the
                    actual employer page.
                  </p>
                ) : (
                  <>
                    <p className="fill-state">
                      {latest.revokedAt
                        ? "Connection revoked"
                        : !active
                          ? "Connection expired"
                          : latest.state === "filled"
                            ? "Form checked — review the employer tab"
                            : latest.state === "needs_input"
                              ? "Your input is needed"
                              : latest.state === "filling"
                                ? "Reading and filling the form"
                                : "Waiting for the employer form"}
                    </p>
                    {progress ? (
                      <ApplicationRecovery
                        catalogId={catalogId}
                        progress={progress}
                        state={data.submission?.state || latest.state}
                      />
                    ) : (
                      <p className="candidate-help">
                        If no report arrives, open the employer's Apply section
                        and use Recheck in the companion. Check that the
                        extension is installed and the destination is supported.
                      </p>
                    )}
                    <Link
                      href={"/application-profile?tab=inbox&job=" + catalogId}
                    >
                      Open answer inbox
                    </Link>
                    {active && (
                      <button onClick={() => void revoke()} disabled={busy}>
                        Revoke connection
                      </button>
                    )}
                    <p className="candidate-help">
                      Filling alone does not mark this job Applied. An
                      authorized submission requires an employer confirmation.
                    </p>
                  </>
                )}
              </section>
            </div>
            <aside className="fill-install">
              <h2>Set up your browser once</h2>
              <p>
                Use Chrome on your computer. The website cannot fill another
                website without the companion.
              </p>
              <a
                className="fill-download"
                href="/downloads/jobcompass-companion.zip"
                download
              >
                <Download size={16} />
                Download Companion 2.1.0
              </a>
              <ol>
                <li>Extract the downloaded ZIP into a folder you will keep.</li>
                <li>
                  Open <code>chrome://extensions</code> and turn on Developer
                  mode.
                </li>
                <li>
                  Choose <strong>Load unpacked</strong> and select the extracted
                  folder.
                </li>
                <li>
                  Return here and choose <strong>Connect and fill</strong>.
                </li>
              </ol>
              <p className="candidate-help">
                Already installed? Reload it from the extensions page after
                replacing its files. The companion works only with JobCompass
                and supported Greenhouse, Lever and Ashby hosts. Mobile browsers
                are not supported in this release.
              </p>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
