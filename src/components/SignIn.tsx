"use client";
import { useState, type FormEvent } from "react";
import { Compass, ArrowRight, LockKeyhole, LoaderCircle } from "lucide-react";
export default function SignIn() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const fields = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fields.get("email"),
          password: fields.get("password"),
          rememberMe: true,
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : "Could not sign in. Check your email and password.",
        );
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="signin-page">
      <section className="signin-panel">
        <span className="signin-mark">
          <Compass size={32} />
        </span>
        <div className="eyebrow">YOUR PRIVATE WORKSPACE</div>
        <h1>
          A little direction.
          <br />A new beginning.
        </h1>
        <p className="muted">Sign in to your JobCompass workspace.</p>
        <form onSubmit={submit}>
          <label className="field">
            Email
            <input type="email" name="email" autoComplete="username" required />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p role="alert" className="danger">
              {error}
            </p>
          )}
          <button disabled={busy} className="primary">
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <ArrowRight size={16} />
            )}
            Sign in
          </button>
        </form>
        <div className="signin-private">
          <LockKeyhole size={14} />
          Owner access only. Registration is closed.
        </div>
      </section>
    </main>
  );
}
