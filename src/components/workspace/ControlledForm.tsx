"use client";
import { useState } from "react";
export default function ControlledForm() {
  const [receipt, setReceipt] = useState(""),
    [error, setError] = useState("");
  return (
    <main className="upgrade-body" style={{ maxWidth: 750 }}>
      <section className="upgrade-panel">
        <span className="eyebrow">CONTROLLED TEST FORM — NO EMPLOYER</span>
        <h1>Companion acceptance fixture</h1>
        <p>
          This sends only to the local fixture endpoint. No real application is
          sent.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            try {
              const response = await fetch("/api/fixture-submission", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  attempt: form.get("companion_attempt"),
                  token: form.get("companion_token"),
                  firstName: form.get("first_name"),
                  lastName: form.get("last_name"),
                  email: form.get("email"),
                }),
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error);
              setReceipt(result.receipt);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <input type="hidden" name="companion_attempt" />
          <input type="hidden" name="companion_token" />
          {[
            ["first_name", "First name"],
            ["last_name", "Last name"],
            ["email", "Email"],
          ].map(([name, label]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                type={name === "email" ? "email" : "text"}
                required
              />
            </label>
          ))}
          <label>
            Resume
            <input name="resume" type="file" accept=".docx" required />
          </label>
          <label>
            Cover letter
            <textarea name="cover_letter" />
          </label>
          <label className="checkline">
            <input type="checkbox" name="consent" required /> I confirm this is
            a controlled test
          </label>
          <button className="primary">Submit controlled fixture</button>
        </form>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {receipt && (
          <p role="status" data-testid="server-receipt">
            Controlled server receipt: {receipt}. No employer submission.
          </p>
        )}
      </section>
    </main>
  );
}
