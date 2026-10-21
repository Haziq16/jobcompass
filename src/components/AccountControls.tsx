"use client";
import { useState, type FormEvent } from "react";
import { LockKeyhole, LogOut } from "lucide-react";
export function SignOut() {
  return (
    <button
      className="text-button"
      onClick={async () => {
        const response = await fetch("/api/auth/sign-out", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (response.ok) window.location.assign("/sign-in");
      }}
    >
      Sign out <LogOut size={14} />
    </button>
  );
}
export function ChangePassword() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: data.get("currentPassword"),
          newPassword: data.get("newPassword"),
          revokeOtherSessions: true,
        }),
      });
      setMessage(
        response.ok
          ? "Password updated. Other sessions have been signed out."
          : "Could not change password. Check your current password and try again.",
      );
      if (response.ok) form.reset();
    } catch {
      setMessage("Could not connect. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>
        <LockKeyhole size={18} />
        Your sign-in
      </h2>
      <p className="muted">
        Update your password and sign out your other sessions.
      </p>
      <form onSubmit={submit}>
        <label className="field">
          Current password
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
          />
        </label>
        <label className="field">
          New password
          <input
            type="password"
            name="newPassword"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <button className="secondary" disabled={busy}>
          Update password
        </button>
        {message && (
          <p role="status" className="muted">
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
