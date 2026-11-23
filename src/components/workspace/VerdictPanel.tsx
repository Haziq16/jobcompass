import Link from "next/link";
import type { VerdictRecord } from "@/lib/apply-verdict";

type Decision = "apply" | "maybe" | "skip";
const decisionLabel: Record<Decision, string> = {
  apply: "Apply",
  maybe: "Maybe",
  skip: "Skip",
};
const levelLabel: Record<string, string> = {
  entry: "entry level",
  junior: "junior",
  mid: "mid level",
  senior: "senior",
  unclear: "unclear",
};
const fitLabel = {
  below: "the role is below your experience",
  match: "a reasonable match",
  stretch: "a stretch above your experience",
  unclear: "not clear from the text",
};
const freshnessLabel = {
  live: "Live",
  unconfirmed: "Not recently confirmed",
  closed: "Likely closed",
  unknown: "Unknown",
};
const sponsorshipLabel: Record<string, string> = {
  offered: "offered",
  excluded: "excluded",
  unmentioned: "not mentioned",
};

// Model output is always rendered as plain React text: no HTML, no markdown,
// no links generated from model output.
function Quote({ text }: { text: string }) {
  return text ? <q className="verdict-quote">{text}</q> : null;
}

export function VerdictBadge({
  decision,
  score,
}: {
  decision: Decision | null | undefined;
  score: number | null | undefined;
}) {
  if (!decision || score === null || score === undefined) return null;
  return (
    <span
      className={`verdict-badge verdict-${decision}`}
      aria-label={`Verdict: ${decisionLabel[decision]}, ${score.toFixed(1)} out of 5`}
    >
      {decisionLabel[decision]} · {score.toFixed(1)}
    </span>
  );
}

export function VerdictEmpty({ studioHref }: { studioHref: string }) {
  return (
    <section
      className="verdict-panel verdict-empty"
      aria-label="Should I apply?"
    >
      <h3>Should I apply?</h3>
      <p>
        No verdict yet. Run an AI review of this job in AI Studio. You need a
        saved CV and your own AI provider key; your CV and this job text are
        sent to the provider you choose.
      </p>
      <Link href={studioHref}>Review this job in AI Studio</Link>
    </section>
  );
}

export default function VerdictPanel({
  record,
  reviewedAt,
}: {
  record: VerdictRecord;
  reviewedAt?: string;
}) {
  if (record.state === "missing")
    return (
      <section className="verdict-panel" aria-label="Should I apply?">
        <h3>Should I apply?</h3>
        <p>
          This review finished without a verdict. Run a new review to get one;
          the review below is still valid.
        </p>
      </section>
    );
  if (record.state === "rejected")
    return (
      <section className="verdict-panel" aria-label="Should I apply?">
        <h3>Should I apply?</h3>
        <p>
          The verdict was withheld because the model made claims JobCompass does
          not allow, such as hiring odds or score guarantees. The review itself
          is unaffected.
        </p>
      </section>
    );
  const r = record;
  const counts = (c: (typeof r.requirements)["required"]) =>
    `${c.supported} supported, ${c.transferable} partial, ${c.not_evidenced} not evidenced${c.unclear ? `, ${c.unclear} unclear` : ""}`;
  const requiredTotal = Object.values(r.requirements.required).reduce(
    (a, b) => a + b,
    0,
  );
  const preferredTotal = Object.values(r.requirements.preferred).reduce(
    (a, b) => a + b,
    0,
  );
  const v = r.validation;
  const removed =
    v.unverifiedJobQuotes +
    v.removedEvidence +
    v.removedRisks +
    v.unverifiedAnswers;
  return (
    <section className="verdict-panel" aria-label="Should I apply?">
      <header className="verdict-head">
        <h3>Should I apply?</h3>
        <VerdictBadge decision={r.decision} score={r.score} />
      </header>
      <p className="verdict-reason">{r.reason}</p>
      {r.adjustments.length > 0 && (
        <p className="verdict-note">
          JobCompass lowered the model&apos;s score from{" "}
          {r.modelScore.toFixed(1)} after checking the evidence.
        </p>
      )}
      <dl className="verdict-facts">
        <div>
          <dt>Seniority</dt>
          <dd>
            {r.seniority.posting === "unclear"
              ? "The posting gives no clear level signal."
              : `Posting reads as ${levelLabel[r.seniority.posting]}`}
            {r.seniority.postingQuote ? ": " : " "}
            <Quote text={r.seniority.postingQuote} />{" "}
            {r.seniority.candidate === "unclear"
              ? "Your CV does not establish a clear level."
              : `Your CV shows ${levelLabel[r.seniority.candidate]} experience.`}
            {r.seniority.fit !== "unclear" &&
              ` This looks like ${fitLabel[r.seniority.fit]}.`}
            {r.seniority.candidateEvidence.map((e) => (
              <span key={e.blockId + e.quote} className="verdict-evidence">
                From your CV: <Quote text={e.quote} />
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>Workplace</dt>
          <dd>
            {r.workplace.arrangement === "unclear"
              ? "Not stated clearly."
              : r.workplace.arrangement[0].toUpperCase() +
                r.workplace.arrangement.slice(1)}{" "}
            <Quote text={r.workplace.quote} />
          </dd>
        </div>
        <div>
          <dt>Timezone</dt>
          <dd>
            {r.timezone.requirement || "No requirement stated."}{" "}
            <Quote text={r.timezone.quote} /> {r.timezone.note}
            {r.timezone.declared && (
              <span className="verdict-evidence">
                Your profile: {r.timezone.declared}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Work authorization</dt>
          <dd>
            {r.authorization.workCountry
              ? `Work in ${r.authorization.workCountry}. `
              : ""}
            Visa sponsorship {sponsorshipLabel[r.authorization.sponsorship]}.{" "}
            <Quote text={r.authorization.sponsorshipQuote} />{" "}
            {r.authorization.note}
          </dd>
        </div>
        <div>
          <dt>Requirements</dt>
          <dd>
            {requiredTotal
              ? `Required: ${counts(r.requirements.required)}. `
              : "No explicitly required items found. "}
            {preferredTotal
              ? `Preferred: ${counts(r.requirements.preferred)}. `
              : ""}
            The evidence table in the review shows each quote.
          </dd>
        </div>
        <div>
          <dt>Listing</dt>
          <dd>
            {freshnessLabel[r.freshness.status]}. {r.freshness.note}
            {r.freshness.postedAt && (
              <span className="verdict-evidence">
                Posted or first seen{" "}
                {new Date(r.freshness.postedAt).toLocaleDateString()}
              </span>
            )}
          </dd>
        </div>
      </dl>
      {r.interviewRisks.length > 0 && (
        <section className="verdict-risks">
          <h4>Interview risks to prepare</h4>
          <ol>
            {r.interviewRisks.map((risk, i) => (
              <li key={i}>
                <Quote text={risk.jobQuote} />
                <p>
                  <strong>Likely question:</strong> {risk.question}
                </p>
                <p>
                  <strong>Honest answer:</strong> {risk.answer}
                </p>
                {risk.evidence.map((e) => (
                  <span key={e.blockId + e.quote} className="verdict-evidence">
                    From your CV: <Quote text={e.quote} />
                  </span>
                ))}
              </li>
            ))}
          </ol>
        </section>
      )}
      <p className="verdict-disclaimer">
        A judgement from your CV and this posting only, not a prediction of
        whether you will be hired.
        {removed > 0 &&
          ` ${removed} unverifiable item${removed === 1 ? " was" : "s were"} removed or marked.`}
        {reviewedAt &&
          ` Reviewed ${new Date(reviewedAt).toLocaleDateString()}.`}{" "}
        JobCompass never submits applications for you.
      </p>
    </section>
  );
}
