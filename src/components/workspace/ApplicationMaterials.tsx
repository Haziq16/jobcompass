"use client";
import { useRef, useState } from "react";
import { api, useResource } from "./client";
import { usePersonalAi } from "./PersonalAiContext";
import { classifyQuestion } from "@/lib/application-memory-contracts";
import type {
  applicationMaterials,
  MaterialsOutput,
} from "@/lib/application-materials";
type Runs = Awaited<ReturnType<typeof applicationMaterials>>;
export default function ApplicationMaterials({
  reviewId,
  catalogId,
  employer,
}: {
  reviewId: string;
  catalogId: string | null;
  employer: string;
}) {
  const { config } = usePersonalAi();
  const history = useResource<{ runs: Runs }>(
    `ai/materials?reviewId=${encodeURIComponent(reviewId)}`,
  );
  const [questions, setQuestions] = useState(
      "Why are you interested in this role?\nDescribe a relevant project and your contribution.",
    ),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [country, setCountry] = useState("");
  const request = useRef<{ input: string; id: string } | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const latest = history.data?.runs[0];
  const output =
    latest?.state === "succeeded" ? (latest.analysis as MaterialsOutput) : null;
  const letterDraft = latest?.drafts.find(
    (draft) => draft.kind === "cover_letter",
  );
  async function generate() {
    if (busy || !consent) return;
    const lines = [
      ...new Set(
        questions
          .split("\n")
          .map((q) => q.trim())
          .filter(Boolean),
      ),
    ];
    const key = JSON.stringify({
      reviewId,
      lines,
      provider: config.provider,
      model: config.model,
    });
    if (request.current?.input !== key)
      request.current = { input: key, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ state: string; error: string | null }>(
        "ai/materials",
        "POST",
        {
          reviewId,
          questions: lines,
          requestKey: request.current.id,
          consent: true,
          provider: config.provider,
          model: config.model,
          ...(config.saved
            ? { useSavedConnection: true }
            : { apiKey: config.apiKey }),
        },
      );
      if (result.state !== "succeeded")
        setError(
          result.error ||
            "The request is recorded but no completed draft is available. No automatic retry was made.",
        );
      history.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remember(question: string, original: string | null) {
    setError("");
    setNotice("");
    try {
      await api("application-profile/answers", "POST", {
        question,
        answer: answers[question] ?? original ?? "",
        category: classifyQuestion(question).category,
        context: { catalogId, company: employer, country },
        reusable: !catalogId,
        reuseScope: "context",
        expectedRevision: 0,
        expiresAt: null,
        reviewed: true,
        aliases: [],
      });
      setNotice(
        catalogId
          ? "Confirmed answer saved for this employer and job. It can now be used in the application."
          : "Confirmed answer saved for this employer. It can now be used in matching applications.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function downloadLetter() {
    if (!output) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          letterDraft?.content ||
            output.coverLetter.map((p) => p.text).join("\n\n"),
        ],
        { type: "text/plain;charset=utf-8" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "cover-letter.txt";
    link.click();
    URL.revokeObjectURL(url);
  }
  async function saveLetter() {
    if (!letterDraft || letter === null || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("ai/materials", "PATCH", {
        id: letterDraft.id,
        revision: letterDraft.revision,
        content: letter,
      });
      setLetter(null);
      history.refresh();
      setNotice("Cover letter saved. Editing cleared its previous approval.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="preparation-materials">
      <h2>Cover letter & screening answers</h2>
      <p>
        Use your reviewed experience to explain why you fit this particular
        role. Drafts enter answer memory only after you confirm them.
      </p>
      <label>
        Application questions, one per line
        <textarea
          value={questions}
          onChange={(e) => setQuestions(e.target.value)}
          rows={4}
        />
      </label>
      <label className="preparation-check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        Send this job, reviewed CV evidence and questions to {config.provider} /{" "}
        {config.model || "your selected model"}. Provider charges may apply.
      </label>
      <button
        className="job-workspace-primary"
        disabled={
          busy || !consent || !config.model || (!config.saved && !config.apiKey)
        }
        onClick={generate}
      >
        {busy
          ? "Writing and checking evidence…"
          : "Generate application drafts"}
      </button>
      {busy && (
        <p role="status">
          The provider request is running. It won’t be retried automatically.
        </p>
      )}
      {(error || history.error) && <p role="alert">{error || history.error}</p>}
      {notice && <p role="status">{notice}</p>}
      {latest && !output && (
        <p>
          Latest request: {latest.state}.{" "}
          {latest.error || "Open this step again to check its recorded result."}
        </p>
      )}
      {output && latest && (
        <>
          <section className="preparation-letter">
            <h3>Your cover letter</h3>
            <label>
              Letter text
              <textarea
                rows={12}
                value={
                  letter ??
                  letterDraft?.content ??
                  output.coverLetter.map((p) => p.text).join("\n\n")
                }
                onChange={(e) => setLetter(e.target.value)}
              />
            </label>
            <div className="job-workspace-actions">
              <button onClick={saveLetter} disabled={busy || letter === null}>
                Save letter
              </button>
              <button onClick={downloadLetter} disabled={letter !== null}>
                Download saved cover letter
              </button>
            </div>
            <p>
              Review the wording before sharing it. This download does not send
              an application.
            </p>
          </section>
          <label>
            Hiring country for saved answers
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="For example, United States"
            />
          </label>
          {output.answers.map((answer) => (
            <section className="preparation-answer" key={answer.question}>
              <h3>{answer.question}</h3>
              {!answer.text && (
                <p>
                  This needs your confirmed answer. The model has not guessed
                  it.
                </p>
              )}
              <label>
                Answer
                <textarea
                  rows={5}
                  value={answers[answer.question] ?? answer.text ?? ""}
                  onChange={(e) =>
                    setAnswers((v) => ({
                      ...v,
                      [answer.question]: e.target.value,
                    }))
                  }
                />
              </label>
              <button
                disabled={!(answers[answer.question] ?? answer.text)?.trim()}
                onClick={() => remember(answer.question, answer.text)}
              >
                Confirm & remember for this {catalogId ? "job" : "employer"}
              </button>
            </section>
          ))}
          <p className="preparation-usage">
            {(latest.settings as { provider?: string }).provider ||
              config.provider}{" "}
            · {latest.inputTokens ?? "Unknown"} input tokens ·{" "}
            {latest.outputTokens ?? "Unknown"} output tokens. Costs are set by
            your provider.
          </p>
        </>
      )}
    </section>
  );
}
