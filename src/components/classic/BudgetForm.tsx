"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { type Usage } from "./common";

export default function BudgetForm({
  usage: u,
  onSave,
}: {
  usage: Usage;
  onSave: (data: unknown) => Promise<void>;
}) {
  const [s, setS] = useState(u.settings);
  const [providerUsed, setProviderUsed] = useState("");
  const [resumeProvider, setResumeProvider] = useState(false);
  useEffect(() => setS(u.settings), [u.settings]);
  function submit(e: FormEvent) {
    e.preventDefault();
    void onSave({
      allowance: s.allowance,
      budget: s.budget,
      dailyCap: s.dailyCap,
      cacheHours: s.cacheHours,
      timezone: s.timezone,
      cycleStart: s.cycleStart,
      cycleEnd: s.cycleEnd,
      ...(providerUsed !== "" ? { providerUsed: Number(providerUsed) } : {}),
      resumeProvider,
    });
  }
  return (
    <form className="budget-form" onSubmit={submit}>
      <div className="budget-totals">
        <strong>
          {u.monthly}
          <span> / {s.budget}</span>
        </strong>
        <small>Estimated credits this cycle</small>
      </div>
      {u.expired && (
        <p className="danger">
          Cycle ended. Set the actual next reset dates below.
        </p>
      )}
      <div className="form-grid">
        {(["allowance", "budget", "dailyCap", "cacheHours"] as const).map(
          (k) => (
            <label className="field" key={k}>
              {
                {
                  allowance: "Plan allowance",
                  budget: "Planned budget",
                  dailyCap: "Daily cap",
                  cacheHours: "Cache hours",
                }[k]
              }
              <input
                type="number"
                min={k === "dailyCap" ? 0 : 1}
                required
                value={s[k]}
                onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })}
              />
            </label>
          ),
        )}
      </div>
      <label className="field">
        Budget timezone
        <input
          required
          value={s.timezone}
          onChange={(e) => setS({ ...s, timezone: e.target.value })}
        />
      </label>
      <div className="form-grid">
        {(["cycleStart", "cycleEnd"] as const).map((k) => (
          <label className="field" key={k}>
            {k === "cycleStart" ? "Cycle starts (UTC)" : "Cycle ends (UTC)"}
            <input
              type="date"
              required
              value={s[k].slice(0, 10)}
              onChange={(e) => {
                if (e.target.value)
                  setS({ ...s, [k]: new Date(e.target.value).toISOString() });
              }}
            />
          </label>
        ))}
      </div>
      <label className="field">
        Reconcile to provider’s actual used credits
        <input
          type="number"
          min="0"
          placeholder="Leave blank to keep local estimate"
          value={providerUsed}
          onChange={(e) => setProviderUsed(e.target.value)}
        />
      </label>
      <p className="muted">
        Check your provider’s reset dates. Cycles never reset automatically.
        Reconciliation includes requests made outside this app.
      </p>
      {u.settings.providerPaused && (
        <label className="checkline">
          <input
            type="checkbox"
            checked={resumeProvider}
            onChange={(e) => setResumeProvider(e.target.checked)}
          />
          I reviewed the provider dashboard. Resume discovery.
        </label>
      )}
      <button className="secondary" type="submit">
        Save budget settings
        <Check size={15} />
      </button>
    </form>
  );
}
