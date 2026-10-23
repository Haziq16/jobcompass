import type { CandidateResult } from "./application-memory";
import { getCandidate, lookupApplicationAnswer } from "./application-memory";
import { normalizeCountry } from "./application-memory-contracts";
import { targetInfo } from "./application-fill-contracts";

export type ApplicationReadiness = {
  status: "compatible" | "unknown" | "incompatible";
  label: string;
  reasons: string[];
  questions: { question: string; country: string; expected: "Yes" | "No" }[];
  automatic: boolean;
  action: string;
};
export type ReadinessJob = {
  title: string;
  description?: string | null;
  country?: string | null;
  applyUrl: string;
  remote?: boolean | null;
};

// Explicit requirements only. A lack of detected conflicts never certifies eligibility.
export function applicationReadiness(
  job: ReadinessJob,
  profile: CandidateResult,
): ApplicationReadiness {
  const text = (job.description || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
  const country = normalizeCountry(job.country || "");
  const confirmed = (section: string) =>
    profile.sections.some((s) => s.section === section && s.confirmed);
  const eligibility = confirmed("eligibility")
    ? profile.values.eligibility.find(
        (r) =>
          normalizeCountry(r.country) === country &&
          (!r.expiresOn || new Date(r.expiresOn + "T23:59:59Z") > new Date()),
      )
    : undefined;
  const reasons: string[] = [],
    questions: ApplicationReadiness["questions"] = [];
  let incompatible = false;
  const unknown = (
    reason: string,
    question: string,
    hiringCountry = country,
    expected: "Yes" | "No" = "Yes",
  ) => {
    reasons.push(reason);
    questions.push({ question, country: hiringCountry, expected });
  };
  const citizens =
    /(?:must be|requires?|only|limited to|restricted to)[^.]{0,90}\b(?:U\.?S\.?|United States)\s+citizens?(?:hip)?\b|\b(?:U\.?S\.?|United States)\s+citizenship\s+(?:is\s+)?required/i.test(
      text,
    );
  const us = confirmed("eligibility")
    ? profile.values.eligibility.find(
        (r) =>
          normalizeCountry(r.country) === "united states" &&
          (!r.expiresOn || new Date(r.expiresOn + "T23:59:59Z") > new Date()),
      )
    : undefined;
  if (citizens) {
    if (
      !us ||
      us.status === "unknown" ||
      us.status === "authorized" ||
      us.status === "not_authorized"
    )
      unknown(
        "The employer requires US citizenship; work authorization alone does not establish citizenship.",
        "Are you a United States citizen?",
        "united states",
      );
    else if (us.status !== "citizen") {
      incompatible = true;
      reasons.push(
        "US citizenship is required and your confirmed US status is not citizen.",
      );
    }
  }
  if (
    /(?:active|current|existing)\s+(?:TS\/?SCI|secret|top secret|security)\s*(?:security\s*)?clearance|(?:must|require|obtain|eligible)[^.]{0,100}\b(?:security clearance|TS\/SCI)\b/i.test(
      job.title + ". " + text,
    )
  )
    unknown(
      "A security-clearance requirement needs a separately confirmed answer.",
      "Do you meet the security-clearance requirement for this role?",
      citizens ? "united states" : country,
    );
  if (
    /\b(no (?:visa )?sponsorship|(?:cannot|unable to|will not|do not) (?:provide |offer )?(?:visa )?sponsor(?:ship)?)\b/i.test(
      text,
    )
  ) {
    if (eligibility?.needsSponsorship === "yes") {
      incompatible = true;
      reasons.push(
        "The employer excludes sponsorship, while you confirmed sponsorship is required in this country.",
      );
    } else if (!eligibility || eligibility.needsSponsorship === "unknown")
      unknown(
        "The employer excludes sponsorship; confirm your country-specific requirement.",
        "Will you require sponsorship to work in this country?",
        country,
        "No",
      );
  }
  if (
    /\b(?:must|currently|actively|required)[^.]{0,65}\b(?:enrolled|enrolment|student)\b|\b(?:enrolled|student)[^.]{0,65}\b(?:required|must)\b/i.test(
      text,
    )
  )
    unknown(
      "The employer requires current student enrollment; a completed degree does not establish this.",
      "Do you meet this role's current student-enrollment requirement?",
    );
  if (
    job.remote !== true &&
    /\b(?:must|require|mandatory)[^.]{0,70}\b(?:on[ -]?site|hybrid|relocat)/i.test(
      text,
    ) &&
    confirmed("preferences") &&
    profile.values.preferences.relocation === "no"
  )
    unknown(
      "Confirm that you can meet this role's on-site or hybrid location requirement.",
      "Can you meet this role's required working location?",
    );
  const supported = Boolean(targetInfo(job.applyUrl));
  const titleTechnology = job.title
    .match(/\b(scala|rust|swift|golang|android|ios)\b/i)?.[1]
    ?.toLowerCase();
  if (titleTechnology && confirmed("skills")) {
    const alternatives: Record<string, string[]> = {
      scala: ["scala"],
      rust: ["rust"],
      swift: ["swift", "ios"],
      golang: ["golang", "go"],
      android: ["android", "kotlin", "java", "flutter", "react native"],
      ios: ["ios", "swift", "objective c", "flutter", "react native"],
    };
    const known = profile.values.skills.map((s) => s.toLowerCase());
    if (
      !alternatives[titleTechnology].some((t) =>
        known.some((s) =>
          (" " + s.replace(/[^a-z0-9]+/g, " ") + " ").includes(" " + t + " "),
        ),
      )
    )
      unknown(
        `The role names ${titleTechnology}, which is not in your confirmed skills.`,
        `Can you substantiate the ${titleTechnology} experience required for this role?`,
      );
  }
  const degree = text
    .match(
      /\b(?:requires?|must have|minimum qualification)[^.]{0,55}\b(bachelor|master|ph\.?d|doctorate)\b/i,
    )?.[1]
    ?.toLowerCase();
  if (degree) {
    const matches = (qualification: string) =>
      degree.startsWith("bachelor")
        ? /\bbachelor|\bb\.?\s?(?:tech|eng|sc|e)\b/i.test(qualification)
        : degree.startsWith("master")
          ? /\bmaster|\bm\.?\s?(?:tech|eng|sc|s|ba)\b/i.test(qualification)
          : /\bph\.?d|doctorate/i.test(qualification);
    const completed =
      confirmed("education") &&
      profile.values.education.some((r) => {
        if (
          !matches(r.qualification) ||
          !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(r.end)
        )
          return false;
        const [year, month, day] = r.end.split("-").map(Number);
        const end = day
          ? Date.UTC(year, month - 1, day)
          : month
            ? Date.UTC(year, month, 0)
            : Date.UTC(year, 11, 31);
        return end <= Date.now();
      });
    if (!completed)
      unknown(
        `Confirm completion of the employer's required ${degree} qualification.`,
        `Have you completed the ${degree} qualification required for this role?`,
      );
  }
  const minimum = text.match(
    /\b(?:at least|minimum(?: of)?|requires?)\s+(\d{1,2})\+?\s+years?\s+(?:of\s+)?(?:professional |relevant |software |engineering |work )?experience/i,
  )?.[1];
  if (minimum) {
    const rows = profile.values.experience;
    const precise =
      confirmed("experience") &&
      rows.every(
        (r) =>
          /^\d{4}-\d{2}/.test(r.start) &&
          /^(?:Present|\d{4}-\d{2})/.test(r.end),
      );
    if (precise) {
      const spans = rows
        .map((r) => [
          new Date(r.start.length === 7 ? r.start + "-01" : r.start).getTime(),
          r.end === "Present"
            ? Date.now()
            : new Date(r.end.length === 7 ? r.end + "-01" : r.end).getTime(),
        ])
        .sort((a, b) => a[0] - b[0]);
      let elapsed = 0,
        end = 0;
      for (const [start, finish] of spans) {
        elapsed += Math.max(
          0,
          Math.min(finish, Date.now()) - Math.max(start, end),
        );
        end = Math.max(end, finish);
      }
      if (elapsed / (365.25 * 86400000) + 1 / 12 < Number(minimum)) {
        incompatible = true;
        reasons.push(
          `The employer requires at least ${minimum} years of experience; your confirmed dated roles show less. Overlapping roles are counted once.`,
        );
      }
    } else
      unknown(
        `Confirm whether you meet the employer's ${minimum}-year experience minimum.`,
        `Do you meet this role's minimum of ${minimum} years of relevant experience?`,
      );
  }
  const status = incompatible
    ? "incompatible"
    : questions.length
      ? "unknown"
      : "compatible";
  return {
    status,
    label: incompatible
      ? "Requirement conflict"
      : questions.length
        ? "Eligibility needs confirmation"
        : "No detected requirement conflict",
    reasons,
    questions,
    automatic: supported && status === "compatible",
    action: !supported
      ? "Manual application: this form is not supported."
      : status !== "compatible"
        ? "Check eligibility before automatic processing."
        : "Supported form; missing employer questions may still need your answers.",
  };
}

export async function resolvedApplicationReadiness(
  job: ReadinessJob,
  catalogId?: string,
  createMissing = false,
  profile?: CandidateResult,
) {
  const result = applicationReadiness(job, profile || (await getCandidate()));
  if (
    !catalogId ||
    !result.questions.length ||
    result.status === "incompatible"
  )
    return result;
  const unresolved: typeof result.questions = [];
  let declined = false;
  for (const question of result.questions) {
    const answer = await lookupApplicationAnswer({
      question: question.question,
      context: { catalogId, country: question.country, company: "" },
      createMissing,
    });
    if (answer.status !== "answered") unresolved.push(question);
    else if (!/^(yes|no)$/i.test(answer.answer?.answer || ""))
      unresolved.push(question);
    else if (
      answer.answer?.answer.toLowerCase() !== question.expected.toLowerCase()
    )
      declined = true;
  }
  const status = declined
    ? "incompatible"
    : unresolved.length
      ? "unknown"
      : "compatible";
  return {
    ...result,
    status,
    questions: unresolved,
    label: declined
      ? "Requirement conflict"
      : unresolved.length
        ? "Eligibility needs confirmation"
        : "Confirmed screening answers",
    automatic: Boolean(targetInfo(job.applyUrl)) && status === "compatible",
    reasons: declined
      ? [
          ...result.reasons,
          "A confirmed screening answer does not meet this requirement.",
        ]
      : result.reasons,
  };
}
