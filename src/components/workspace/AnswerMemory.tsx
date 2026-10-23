"use client";
import { useState } from "react";
import { Copy, Plus, Check, Trash2, Pencil, Search } from "lucide-react";
import {
  answerCategories,
  classifyQuestion,
  type AnswerInput,
  type AnswerCategory,
} from "@/lib/application-memory-contracts";
import type {
  applicationMemory,
  lookupApplicationAnswer,
} from "@/lib/application-memory";
import { api, useResource } from "./client";
type Memory = Awaited<ReturnType<typeof applicationMemory>>;
type Lookup = Awaited<ReturnType<typeof lookupApplicationAnswer>>;
type Answer = Memory["answers"][number];
type Question = Memory["questions"][number];
type Draft = Omit<AnswerInput, "reviewed">;
const when = (v: Date | string | null) =>
  v ? new Date(String(v)).toLocaleDateString() : "No fixed expiry";
const contextLabel = (v: {
  country: string | null;
  company: string | null;
  catalogId: string | null;
}) =>
  [v.country, v.company, v.catalogId ? "One queued job" : null]
    .filter(Boolean)
    .join(" · ") || "General context";
const errorText = (e: unknown) =>
  (
    ({
      revision_conflict:
        "This changed in another tab. Reload the library before editing.",
      answer_country_required:
        "Choose a country for salary, authorization or sponsorship answers.",
      answer_context_required:"This answer requires a country or employer. Keep its current context or choose reuse within the same country.",
      answer_company_required:
        "Choose the employer for a company-specific answer.",
      question_country_mismatch:
        "The question names a different country. Correct the context before saving.",
      question_company_mismatch:
        "The employer does not match the linked queued job.",
      answer_alias_conflict:
        "An equivalent question has a different meaning. Remove it from the alias list.",
      answer_already_saved:
        "An answer already exists for this question and context. Edit that saved answer instead.",
      answer_job_required:
        "Open this form from a queued job to save a one-job-only answer.",
      answer_expiry_in_past:
        "Choose a future expiry date, or leave it blank to renew with the default policy.",
    }) as Record<string, string>
  )[(e as Error).message] ||
  "Could not save your change. Your draft is still here.";
function initial(
  question = "",
  context = { country: "", company: "", catalogId: null as string | null },
  questionId: string | null = null,
): Draft {
  return {
    expectedRevision: 0,
    question,
    aliases: [],
    category: classifyQuestion(question).category,
    answer: "",
    context,
    reusable: true,
    reuseScope: "context",
    expiresAt: null,
    questionId,
  };
}
function AnswerForm({
  draft,
  onClose,
  onSaved,
}: {
  draft: Draft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(draft),
    [aliases, setAliases] = useState(draft.aliases.join("\n")),
    [expiry, setExpiry] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    setError("");
    if (!reviewed) {
      setError(
        "Confirm this answer and any equivalent questions before saving.",
      );
      return;
    }
    setBusy(true);
    try {
      await api("application-profile/answers", "POST", {
        ...value,
        aliases: aliases
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        expiresAt: expiry
          ? new Date(expiry + "T23:59:59Z").toISOString()
          : null,
        reviewed: true,
      });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const known = classifyQuestion(value.question);
  return (
    <section className="answer-editor" aria-labelledby="answer-editor-title">
      <div className="candidate-heading-row">
        <div>
          <h2 id="answer-editor-title">
            {draft.id ? "Review saved answer" : "Confirm an application answer"}
          </h2>
          <p>
            Use your own verified information. Nothing is sent to an employer.
          </p>
        </div>
        <button onClick={onClose} disabled={busy}>
          Close editor
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          Application question
          <textarea
            aria-label="Application question"
            rows={2}
            value={value.question}
            onChange={(e) => {
              const c = classifyQuestion(e.target.value);
              setValue((v) => ({
                ...v,
                question: e.target.value,
                category: c.category === "custom" ? v.category : c.category,
              }));
              setReviewed(false);
            }}
            required
            minLength={3}
          />
        </label>
        <div className="candidate-fields">
          <label>
            Answer category
            <select
              aria-label="Answer category"
              value={
                known.category === "custom" ? value.category : known.category
              }
              disabled={known.category !== "custom"}
              onChange={(e) => {
                setValue((v) => ({
                  ...v,
                  category: e.target.value as AnswerCategory,
                }));
                setReviewed(false);
              }}
            >
              {answerCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Country for this answer
            <input
              aria-label="Country for this answer"
              value={value.context.country}
              onChange={(e) => {
                setValue((v) => ({
                  ...v,
                  context: { ...v.context, country: e.target.value },
                }));
                setReviewed(false);
              }}
              placeholder="Required for salary and work eligibility"
            />
          </label>
          <label>
            Employer for this answer
            <input
              aria-label="Employer for this answer"
              disabled={Boolean(value.context.catalogId)}
              value={value.context.company}
              onChange={(e) => {
                setValue((v) => ({
                  ...v,
                  context: { ...v.context, company: e.target.value },
                }));
                setReviewed(false);
              }}
              placeholder={
                value.context.catalogId
                  ? "Taken from the linked queued job"
                  : "General unless specified"
              }
            />
          </label>
          <label>
            Optional expiry
            <input
              aria-label="Optional expiry"
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
            <small>
              Availability: at most 7 days; salary: 30 days; eligibility: 90
              days. Blank renews with that policy.
            </small>
          </label>
        </div>
        <label>
          Your confirmed answer
          <textarea
            aria-label="Your confirmed answer"
            rows={5}
            value={value.answer}
            onChange={(e) => {
              setValue((v) => ({ ...v, answer: e.target.value }));
              setReviewed(false);
            }}
            required
            maxLength={5000}
          />
        </label>
        <label>
          Equivalent questions, one per line
          <textarea
            aria-label="Equivalent questions, one per line"
            rows={3}
            value={aliases}
            onChange={(e) => {
              setAliases(e.target.value);
              setReviewed(false);
            }}
          />
          <small>
            Add only questions that need exactly the same answer. Work
            authorization and sponsorship are separate questions.
          </small>
        </label>
        <label className="candidate-checkbox">
          <input
            type="checkbox"
            checked={value.reusable}
            disabled={!value.context.catalogId}
            onChange={(e) => {
              setValue((v) => ({ ...v, reusable: e.target.checked }));
              setReviewed(false);
            }}
          />
          Reuse for equivalent questions in this context
        </label>
        {value.reusable && (
          <label>
            Where this answer may be reused
            <select
              value={value.reuseScope}
              onChange={(e) => {
                setValue((v) => ({
                  ...v,
                  reuseScope: e.target.value as Draft["reuseScope"],
                }));
                setReviewed(false);
              }}
            >
              <option value="context">
                Keep the current job and employer context
              </option>
              <option value="country">
                Other employers in the same confirmed country
              </option>
              {![
                "authorization",
                "sponsorship",
                "salary",
                "motivation",
              ].includes(value.category) && (
                <option value="general">
                  Other employers, when the question has the same meaning
                </option>
              )}
            </select>
            <small>
              Changing scope requires your confirmation. Employer-specific
              answers stay in their current context unless you deliberately
              broaden it.
            </small>
          </label>
        )}
        {!value.context.catalogId && (
          <p className="candidate-help">
            For a one-job-only answer, open Application answers from a job in
            your queue.
          </p>
        )}
        <label className="candidate-checkbox">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I confirm this answer, its context and the equivalence of any added
          questions.
        </label>
        {error && (
          <p role="alert" className="candidate-error">
            {error}
          </p>
        )}
        <footer className="candidate-form-footer">
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save confirmed answer"}
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </footer>
      </form>
    </section>
  );
}
export default function AnswerMemory({
  view,
  catalogId,
  onNotice,
}: {
  view: "answers" | "inbox";
  catalogId: string | null;
  onNotice: (s: string) => void;
}) {
  const [page, setPage] = useState(1);
  const resource = useResource<Memory>(
    "application-profile/memory?page=" +
      page +
      (catalogId ? "&job=" + catalogId : ""),
  );
  const [draft, setDraft] = useState<Draft | null>(null),
    [question, setQuestion] = useState(""),
    [country, setCountry] = useState(""),
    [company, setCompany] = useState(""),
    [result, setResult] = useState<Lookup | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [showAll, setShowAll] = useState(false);
  async function lookup() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const found = await api<Lookup>("application-profile/lookup", "POST", {
        question,
        context: { country, company, catalogId },
        createMissing: true,
      });
      setResult(found);
      resource.refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function edit(answer: Answer, questionId: string | null = null) {
    setDraft({
      id: answer.id,
      expectedRevision: answer.revision,
      question: answer.question,
      aliases: answer.aliases.filter((q) => q !== answer.question),
      category: answer.category as AnswerCategory,
      answer: answer.answer,
      context: {
        country: answer.country || "",
        company: answer.company || "",
        catalogId: answer.catalogId,
      },
      reusable: answer.reusable,
      reuseScope: "context",
      expiresAt: null,
      questionId,
    });
  }
  async function answerQuestion(q: Question) {
    let existing = q.answerId
      ? resource.data?.answers.find((a) => a.id === q.answerId)
      : null;
    if (q.answerId && !existing) {
      try {
        existing = await api<Answer>(
          "application-profile/answers/" + q.answerId,
        );
      } catch (e) {
        setError(errorText(e));
        return;
      }
    }
    if (existing) edit(existing, q.id);
    else
      setDraft(
        initial(
          q.question,
          {
            country: q.country || "",
            company: q.company || "",
            catalogId: q.catalogId,
          },
          q.id,
        ),
      );
  }
  async function remove(answer: Answer) {
    if (
      !window.confirm(
        "Delete this saved answer? Questions that rely on it will need a new answer.",
      )
    )
      return;
    setError("");
    try {
      await api("application-profile/answers", "DELETE", {
        id: answer.id,
        revision: answer.revision,
      });
      resource.refresh();
      onNotice("Answer deleted. Linked questions need an answer again.");
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function dismiss(q: Question) {
    setError("");
    try {
      await api("application-profile/dismiss", "POST", {
        id: q.id,
        revision: q.revision,
      });
      resource.refresh();
    } catch (e) {
      setError(errorText(e));
    }
  }
  const questions =
    resource.data?.questions.filter(
      (q) =>
        showAll || !["answered", "dismissed"].includes(q.resolution.status),
    ) || [];
  return (
    <div className="answer-workbench">
      <section className="answer-lookup">
        <h2>Check a real application question</h2>
        <p>
          Paste a question from an employer. A confirmed answer is shown only
          when its meaning and context match. Missing or outdated answers go to
          your inbox.
        </p>
        {catalogId && (
          <p className="candidate-context">
            Linked to a job in your queue. The employer is set from that job.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup();
          }}
        >
          <label>
            Question to check
            <textarea
              aria-label="Question to check"
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
              minLength={3}
              maxLength={1000}
            />
          </label>
          <div className="candidate-fields">
            <label>
              Question country
              <input
                aria-label="Question country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Country where the job is based"
              />
            </label>
            <label>
              Question employer
              <input
                aria-label="Question employer"
                value={company}
                disabled={Boolean(catalogId)}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={
                  catalogId
                    ? "From queued job"
                    : "Optional unless company-specific"
                }
              />
            </label>
          </div>
          <button className="primary" type="submit" disabled={busy}>
            <Search size={16} />
            {busy ? "Checking…" : "Find confirmed answer"}
          </button>
        </form>
        {result && (
          <div className="answer-result" role="status">
            <h3>
              {result.status === "answered"
                ? "Confirmed answer found"
                : result.status === "needs_review"
                  ? "Answer needs review"
                  : result.status === "conflict"
                    ? "Conflicting answers"
                    : result.status === "context_required"
                      ? "Country needed"
                      : "Answer needed"}
            </h3>
            <p>{result.message}</p>
            {result.answer ? (
              <>
                <blockquote>{result.answer.answer}</blockquote>
                <p className="candidate-help">
                  {result.answer.source} · confirmed{" "}
                  {when(result.answer.verifiedAt)}
                </p>
                <button
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(result.answer!.answer)
                      .then(() =>
                        onNotice("Answer copied. Nothing was submitted."),
                      )
                      .catch(() =>
                        onNotice("Select the answer text to copy it."),
                      )
                  }
                >
                  <Copy size={16} />
                  Copy answer
                </button>
              </>
            ) : (
              <button
                onClick={() =>
                  setDraft(
                    initial(
                      question,
                      {
                        country: result.context.country || "",
                        company: result.context.company || "",
                        catalogId: result.context.catalogId,
                      },
                      result.questionId,
                    ),
                  )
                }
              >
                Answer this question
              </button>
            )}
          </div>
        )}
      </section>
      {(error || resource.error) && (
        <div className="candidate-error" role="alert">
          <p>{error || "Could not load answer memory."}</p>
          <button onClick={resource.refresh}>Reload answer library</button>
        </div>
      )}
      {draft && (
        <AnswerForm
          key={draft.id || draft.questionId || "new"}
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            setResult(null);
            resource.refresh();
            onNotice(
              "Confirmed answer saved. Equivalent questions can use it only in the chosen context and before expiry.",
            );
          }}
        />
      )}
      <section className="answer-collection">
        <div className="candidate-heading-row">
          <div>
            <h2>
              {view === "answers"
                ? "Your answer library"
                : "Questions that need you"}
            </h2>
            <p>
              {view === "answers"
                ? "Review, update or remove the information applications can reuse."
                : "Answer once with the correct context. We never fill a gap by guessing."}
            </p>
          </div>
          {view === "answers" ? (
            <button
              onClick={() =>
                setDraft(initial("", { country: "", company: "", catalogId }))
              }
            >
              <Plus size={16} />
              Add answer
            </button>
          ) : (
            <label className="candidate-checkbox">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
              />
              Show answered and dismissed
            </label>
          )}
        </div>
        {resource.loading && !resource.data ? (
          <p role="status">Loading your private answer memory…</p>
        ) : view === "answers" ? (
          resource.data?.answers.length ? (
            <div className="answer-list">
              {resource.data.answers.map((a) => (
                <article className="answer-row" key={a.id}>
                  <div>
                    <span
                      className={
                        a.health === "current"
                          ? "candidate-confirmed"
                          : "candidate-status"
                      }
                    >
                      {a.health === "current"
                        ? "Confirmed"
                        : a.health === "expired"
                          ? "Expired"
                          : "Profile changed"}
                    </span>
                    <h3>{a.question}</h3>
                    <p className="candidate-help">
                      {contextLabel(a)} ·{" "}
                      {a.reusable ? "Reusable in context" : "This job only"}
                    </p>
                    <p className="answer-copy">{a.answer}</p>
                    <p className="candidate-help">
                      Confirmed {when(a.verifiedAt)} · Expires{" "}
                      {when(a.expiresAt)}
                    </p>
                    {a.aliases.length > 1 && (
                      <details>
                        <summary>Equivalent question wording</summary>
                        <ul>
                          {a.aliases.map((v) => (
                            <li key={v}>{v}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  <div className="candidate-inline-actions">
                    <button onClick={() => edit(a)}>
                      <Pencil size={15} />
                      {a.health === "current" ? "Edit answer" : "Review again"}
                    </button>
                    <button onClick={() => void remove(a)}>
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="candidate-empty">
              <h3>No saved answers yet</h3>
              <p>
                Confirmed profile fields already answer common questions. Add
                screening answers here as you encounter them.
              </p>
            </div>
          )
        ) : questions.length ? (
          <div className="answer-list">
            {questions.map((q) => (
              <article className="answer-row" key={q.id}>
                <div>
                  <span
                    className={
                      q.resolution.status === "answered"
                        ? "candidate-confirmed"
                        : "candidate-status"
                    }
                  >
                    {q.resolution.status.replaceAll("_", " ")}
                  </span>
                  <h3>{q.question}</h3>
                  <p className="candidate-help">{contextLabel(q)}</p>
                  <p>{q.resolution.message}</p>
                  {q.sourceDraft && (
                    <details>
                      <summary>Use evidence from your profile</summary>
                      <p>{q.sourceDraft.source}</p>
                      <blockquote>{q.sourceDraft.text}</blockquote>
                      <button
                        onClick={() =>
                          setDraft({
                            ...initial(
                              q.question,
                              {
                                country: q.country || "",
                                company: q.company || "",
                                catalogId: q.catalogId,
                              },
                              q.id,
                            ),
                            answer: q.sourceDraft!.text,
                          })
                        }
                      >
                        Review passage as an answer draft
                      </button>
                    </details>
                  )}
                  {q.resolution.answer && (
                    <blockquote>{q.resolution.answer.answer}</blockquote>
                  )}
                </div>
                <div className="candidate-inline-actions">
                  {q.resolution.status !== "dismissed" && (
                    <button onClick={() => answerQuestion(q)}>
                      {q.resolution.status === "answered"
                        ? "Update answer"
                        : "Answer question"}
                    </button>
                  )}
                  {q.state !== "dismissed" && (
                    <button onClick={() => void dismiss(q)}>Dismiss</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="candidate-empty">
            <Check size={24} />
            <h3>No unanswered questions on this page</h3>
            <p>
              Questions you check above appear here when they need information,
              context or renewed confirmation.
            </p>
          </div>
        )}
        {resource.data &&
          Math.max(resource.data.totalAnswers, resource.data.totalQuestions) >
            30 && (
            <nav
              className="candidate-pagination"
              aria-label="Answer memory pages"
            >
              <button
                disabled={page <= 1 || resource.loading}
                onClick={() => setPage((v) => v - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                disabled={
                  page * 30 >=
                    Math.max(
                      resource.data.totalAnswers,
                      resource.data.totalQuestions,
                    ) || resource.loading
                }
                onClick={() => setPage((v) => v + 1)}
              >
                Next
              </button>
            </nav>
          )}
      </section>
    </div>
  );
}
