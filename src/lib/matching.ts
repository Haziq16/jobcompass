export type MatchProfile = {
  skills: string[];
  titles: string[];
  locations: string[];
  excluded: string[];
  years: number | null;
  arrangement: string;
  aliases?: unknown;
};
type MatchJob = {
  title: string;
  location: string | null;
  description: string | null;
  qualifications: string[];
  remote: boolean | null;
};
export function hasTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(text);
}
export function matchJob(job: MatchJob, p: MatchProfile) {
  const all = `${job.title}\n${job.description || ""}`;
  const requirements = job.qualifications.join("\n");
  const aliases =
    p.aliases && typeof p.aliases === "object"
      ? (p.aliases as Record<string, string[]>)
      : {};
  const present = (skill: string, text: string) =>
    hasTerm(text, skill) ||
    (skill.toLowerCase() === "jetpack compose" &&
      hasTerm(all, "android") &&
      hasTerm(text, "compose")) ||
    (Array.isArray(aliases[skill]) &&
      aliases[skill].some((alias) => hasTerm(text, alias)));
  const matched = p.skills.filter((s) => present(s, requirements || all));
  const absent = p.skills.filter((s) => !matched.includes(s));
  const yearsText = requirements.match(
    /(\d+)\+?\s*(?:-\s*\d+\s*)?years?\s+(?:of\s+)?experience/i,
  );
  const requiredYears = yearsText ? Number(yearsText[1]) : null;
  const titleMatch = p.titles.some((t) => hasTerm(job.title, t));
  const locationKnown = Boolean(job.location && p.locations.length);
  const locationMatch = p.locations.some((l) => hasTerm(job.location || "", l));
  const excluded = p.excluded.filter((k) => hasTerm(all, k));
  const skillKnown =
    p.skills.length > 0 && Boolean(requirements || job.description);
  const categories = [
    {
      name: "Skills overlap",
      weight: 40,
      known: skillKnown,
      value: p.skills.length ? matched.length / p.skills.length : 0,
      evidence: matched.length
        ? `${matched.join(", ")} ${requirements ? "in qualification highlights" : "mentioned in text (uncertain requirement)"}`
        : "No matching terms found",
    },
    {
      name: "Target title",
      weight: 25,
      known: p.titles.length > 0,
      value: titleMatch ? 1 : 0,
      evidence: titleMatch
        ? "Active target title appears in the listing"
        : "No exact target phrase",
    },
    {
      name: "Experience",
      weight: 15,
      known: requiredYears !== null && p.years !== null,
      value:
        requiredYears !== null && p.years !== null && p.years >= requiredYears
          ? 1
          : 0,
      evidence:
        requiredYears === null
          ? "Required experience unknown"
          : `${requiredYears}+ years in qualification highlights`,
    },
    {
      name: "Location & arrangement",
      weight: 15,
      known: locationKnown,
      value:
        locationMatch &&
        (p.arrangement === "any" ||
          (p.arrangement === "remote" && job.remote === true) ||
          (p.arrangement === "onsite" && job.remote === false))
          ? 1
          : 0,
      evidence: locationKnown
        ? `${locationMatch ? "Preferred location matches" : "Location differs"}. Remote-country eligibility remains unknown.`
        : "Location eligibility unknown",
    },
    {
      name: "Preferences",
      weight: 5,
      known: p.excluded.length > 0,
      value: excluded.length ? 0 : 1,
      evidence: excluded.length
        ? `Excluded terms: ${excluded.join(", ")}`
        : "No excluded terms found",
    },
  ];
  const coverage = categories
    .filter((c) => c.known)
    .reduce((s, c) => s + c.weight, 0);
  const score = coverage
    ? Math.round(
        (categories
          .filter((c) => c.known)
          .reduce((s, c) => s + c.weight * c.value, 0) /
          coverage) *
          100,
      )
    : null;
  return {
    score,
    coverage,
    categories,
    matched,
    missing: absent,
    uncertain: [
      "Work authorization",
      "Visa sponsorship",
      "Remote-country eligibility",
      "Relocation",
      "Language requirements",
    ],
    note: "A personal relevance estimate, not an ATS score or interview probability. Unknown categories are excluded; coverage shows the weight assessed. Text mentions are not confirmed requirements.",
  };
}
