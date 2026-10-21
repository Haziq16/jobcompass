"use client";
import { useState } from "react";
import { ChangePassword } from "../AccountControls";
import { api, useResource } from "./client";
import Link from "next/link";
import { usePersonalAi } from "./PersonalAiContext";
export default function Preferences() {
  const { enabled: ai } = usePersonalAi();
  const session = useResource<{ user?: { name: string; email: string } }>(
    "auth/get-session",
  );
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function clearProfile() {
    if (
      !window.confirm(
        "Clear your matching profile and any earlier assistant documents? Your jobs, saved items and application history will remain.",
      )
    )
      return;
    setBusy(true);
    try {
      await api("profile", "DELETE", { confirm: "DELETE PROFILE" });
      setMessage(
        "Your profile has been cleared. Jobs and applications are preserved.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="upgrade-heading">
        <div>
          <span className="eyebrow">YOUR ACCOUNT</span>
          <h1>Settings</h1>
          <p>Manage your account, data and workspace.</p>
        </div>
      </div>
      <div className="settings-stack">
        <section className="upgrade-panel">
          <h2>Account details</h2>
          <dl className="account-details">
            <div>
              <dt>Name</dt>
              <dd>{session.data?.user?.name || "Local workspace"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                {session.data?.user?.email ||
                  "Local mode — no sign-in required"}
              </dd>
            </div>
          </dl>
          <p className="muted">
            Your jobs, profile and applications belong to your account. Other
            members cannot see them.
          </p>
        </section>
        {session.data?.user && <ChangePassword />}
        <section className="upgrade-panel">
          <h2>Your data</h2>
          <p>Download your workspace records or clear your matching profile.</p>
          <div className="direct-actions">
            <a className="secondary" href="/api/export" download>
              Export my workspace
            </a>
            <button
              className="danger-outline"
              disabled={busy}
              onClick={() => void clearProfile()}
            >
              Clear profile
            </button>
          </div>
          {message && <p role="status">{message}</p>}
        </section>
        {ai && (
          <section className="upgrade-panel">
            <h2>Your optional AI tools</h2>
            <p>
              Use your own provider key for résumé and job reviews. Keys stay in
              tab memory, or are saved encrypted in your account when you choose
              “Save connection”.
            </p>
            <Link href="/assistant">Open AI studio</Link>
          </section>
        )}
        <section className="upgrade-panel release-note">
          <h2>Focused on the essentials</h2>
          <p>
            Discovery, shortlisting and application tracking are available now.
            Assisted form filling remains disabled. You record application
            outcomes yourself.
          </p>
        </section>
      </div>
    </>
  );
}
