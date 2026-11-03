"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Compass, ArrowRight, Check, LoaderCircle } from "lucide-react";
export default function AuthForm({
  signup = false,
  publicSignup = false,
}: {
  signup?: boolean;
  publicSignup?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(e.currentTarget);
    try {
      const response = await fetch(
        `/api/auth/${signup ? "sign-up" : "sign-in"}/email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: String(values.get("email")).trim().toLowerCase(),
            password: values.get("password"),
            ...(signup
              ? { name: String(values.get("name")).trim() }
              : { rememberMe: true }),
          }),
        },
      );
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Too many attempts. Please wait a minute and try again."
            : signup
              ? "We couldn't create your account. Try another email or sign in if you already have an account."
              : "We couldn't sign you in. Check your email and password.",
        );
        return;
      }
      window.location.assign("/discover");
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Link className="auth-brand" href="/">
          <Compass size={27} />
          JobCompass
        </Link>
        <div>
          <span className="eyebrow">A CLEARER PATH FORWARD</span>
          <h1>
            Your next role.
            <br />
            <span>A little more in focus.</span>
          </h1>
          <p>
            A calm, personal workspace for your job search. Discover
            opportunities and keep your next steps together.
          </p>
          <ul>
            <li>
              <Check size={18} />
              Find jobs straight from company boards
            </li>
            <li>
              <Check size={18} />
              Build a shortlist that matters
            </li>
            <li>
              <Check size={18} />
              Track every application and follow-up
            </li>
          </ul>
        </div>
        <small>Less searching in circles. More moving forward.</small>
      </section>
      <section className="auth-form-side">
        <div className="auth-card">
          <span className="auth-kicker">YOUR PERSONAL WORKSPACE</span>
          <h2>{signup ? "Create your account" : "Welcome back"}</h2>
          <p>
            {signup
              ? "Start organizing your search. It's free to get started."
              : publicSignup
                ? "Sign in and pick up where you left off."
                : "Sign in to your private JobCompass workspace. Access is restricted to the owner."}
          </p>
          <form onSubmit={submit}>
            {signup && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Alex Morgan"
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                autoComplete={signup ? "new-password" : "current-password"}
                minLength={signup ? 12 : undefined}
                maxLength={128}
                required
                placeholder={
                  signup ? "At least 12 characters" : "Your password"
                }
              />
            </label>
            {signup && (
              <small>
                Use at least 12 characters. A password manager can help.
              </small>
            )}
            {error && (
              <p role="alert" className="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <ArrowRight size={18} />
              )}{" "}
              {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
            </button>
          </form>
          {(signup || publicSignup) && (
            <p className="auth-switch">
              {signup ? "Already have an account?" : "New to JobCompass?"}{" "}
              <Link href={signup ? "/sign-in" : "/sign-up"}>
                {signup ? "Sign in" : "Create an account"}
              </Link>
            </p>
          )}
          <div className="auth-privacy">
            <span className="status-dot" />
            Your saved jobs and application notes are private to your account.
          </div>
        </div>
      </section>
    </main>
  );
}
