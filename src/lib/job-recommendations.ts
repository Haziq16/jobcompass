import { Prisma } from "@prisma/client";
import { catalogTextSql } from "./catalog-text";
import { db } from "./db";
import { cvSkillSignals } from "./resume-checks";
import { hasTerm } from "./matching";
import {
  cachedCatalogSkills,
  CATALOG_SKILL_VERSION,
} from "./catalog-skill-signals";
export type SearchProfile = {
  titles: string[];
  skills: { term: string; source: "cv" | "profile" }[];
  locations: string[];
  arrangement: string;
  excluded: string[];
  hasCv: boolean;
  years: number | null;
};
const clean = (values: string[], max: number) =>
  [
    ...new Map(
      values
        .map((s) => s.trim())
        .filter((s) => s.length >= 2 && s.length <= 80)
        .map((s) => [s.toLowerCase(), s]),
    ).values(),
  ].slice(0, max);
export async function recommendationProfile(): Promise<SearchProfile> {
  const profile = await db.profile.findUnique({ where: { id: "owner" } });
  const asset = !profile?.cvText
    ? await db.resumeAsset.findFirst({
        where: { isDefault: true },
        select: { text: true },
      })
    : null;
  const cv = profile?.cvText || asset?.text || "";
  const roles =
    cv.match(
      /\b(?:android|ios|mobile|frontend|front-end|backend|back-end|full-stack|full stack|software|data|machine learning|devops|cloud|platform)\s+(?:developer|engineer|analyst|scientist)|\b(?:product manager|project manager|ux designer|ui designer|graphic designer|accountant|registered nurse|customer success manager|sales manager)\b/gi,
    ) || [];
  const fromCv = cvSkillSignals(cv);
  const manual = clean(profile?.skills || [], 24);
  return {
    titles: clean([...(profile?.titles || []), ...roles], 8),
    skills: clean([...manual, ...fromCv], 32).map((term) => ({
      term,
      source: fromCv.some((t) => t.toLowerCase() === term.toLowerCase())
        ? "cv"
        : "profile",
    })),
    locations: clean(profile?.locations || [], 8),
    arrangement: profile?.arrangement || "any",
    excluded: clean(profile?.excluded || [], 15),
    hasCv: Boolean(cv.trim()),
    years: profile?.years ?? null,
  };
}
export function smartQuery(q: string) {
  if (/["|():]|\bOR\b|(?:^|\s)-\w/.test(q)) return q;
  const aliases: Record<string, string[]> = {
    developer: ["developer", "engineer"],
    engineer: ["engineer", "developer"],
    frontend: ["frontend", '"front end"'],
    backend: ["backend", '"back end"'],
    javascript: ["javascript", "js"],
    typescript: ["typescript", "ts"],
  };
  let variants = [""];
  for (const word of q.split(/\s+/)) {
    variants = variants
      .flatMap((v) =>
        (aliases[word.toLowerCase()] || [word]).map((w) => `${v} ${w}`.trim()),
      )
      .slice(0, 8);
  }
  return variants.join(" OR ");
}
const rx = (s: string) =>
  `(^|[^a-z0-9])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`;
function catalogMention(term: string) {
  return cachedCatalogSkills.has(term.toLowerCase())
    ? Prisma.sql`CASE WHEN j."skillKeysVersion"=${CATALOG_SKILL_VERSION} AND j."skillKeysHash"=j.hash THEN ${term.toLowerCase()}=ANY(j."skillKeys") ELSE ${catalogTextSql("j")} ~* ${rx(term)} END`
    : Prisma.sql`${catalogTextSql("j")} ~* ${rx(term)}`;
}
export function recommendationSql(p: SearchProfile) {
  const terms: Prisma.Sql[] = [Prisma.sql`CAST(0 AS double precision)`];
  for (const title of p.titles) {
    const variants = [
      title,
      title.replace(/developer/gi, "engineer"),
      title.replace(/engineer/gi, "developer"),
    ];
    terms.push(
      Prisma.sql`CASE WHEN (${Prisma.join(
        [...new Set(variants)].map((t) => Prisma.sql`j.title ~* ${rx(t)}`),
        " OR ",
      )}) THEN 12.0 ELSE 0 END`,
    );
  }
  for (const skill of p.skills) {
    const match = catalogMention(skill.term);
    terms.push(Prisma.sql`CASE WHEN (${match}) THEN 2.0 ELSE 0 END`);
  }
  for (const place of p.locations)
    terms.push(
      Prisma.sql`CASE WHEN COALESCE(j.location,'') ~* ${rx(place)} THEN 1.5 ELSE 0 END`,
    );
  if (p.arrangement === "remote")
    terms.push(Prisma.sql`CASE WHEN j.remote=true THEN 1.5 ELSE 0 END`);
  if (
    p.years !== null &&
    p.years < 2 &&
    !p.titles.some((t) => /senior|staff|principal|director/i.test(t))
  )
    terms.push(
      Prisma.sql`CASE WHEN j.title ~* ${rx("senior") + "|" + rx("staff") + "|" + rx("principal") + "|" + rx("director")} THEN -15.0 ELSE 0 END`,
    );
  for (const term of p.excluded)
    terms.push(
      Prisma.sql`CASE WHEN (${catalogMention(term)}) THEN -30.0 ELSE 0 END`,
    );
  return Prisma.sql`(${Prisma.join(terms, " + ")})`;
}
export function recommendationReasons(
  job: {
    title: string;
    searchText: string;
    location: string | null;
    remote: boolean | null;
  },
  p: SearchProfile,
) {
  const title = p.titles.find(
    (t) =>
      hasTerm(job.title, t) ||
      hasTerm(job.title, t.replace(/developer/gi, "engineer")) ||
      hasTerm(job.title, t.replace(/engineer/gi, "developer")),
  );
  const skills = p.skills.filter((s) => hasTerm(job.searchText, s.term));
  const excluded = p.excluded.filter((t) => hasTerm(job.searchText, t));
  return {
    label: excluded.length
      ? "Check your exclusions"
      : title && skills.length
        ? "Strong overlap"
        : title || skills.length
          ? "Some overlap"
          : "Explore this role",
    reasons: [
      ...(title ? [`Role aligns with ${title}`] : []),
      ...skills
        .slice(0, 4)
        .map(
          (s) =>
            `${s.source === "cv" ? "CV mentions" : "Profile skill"}: ${s.term}`,
        ),
      ...(p.locations.some((l) => hasTerm(job.location || "", l))
        ? ["Preferred location"]
        : []),
      ...(p.arrangement === "remote" && job.remote === true
        ? ["Remote preference"]
        : []),
      ...excluded.map((t) => `Excluded term: ${t}`),
    ],
    skills: skills.map((s) => s.term),
  };
}
