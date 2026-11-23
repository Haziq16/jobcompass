import type { MatchPreferences } from "@/lib/match-contracts";
export type MatchListing = {
  readiness?: import("@/lib/application-readiness").ApplicationReadiness;
  id: string;
  title: string;
  employer: string;
  location: string | null;
  remote: boolean | null;
  employmentType: string | null;
  salaryText: string | null;
  applyUrl: string;
  sourceUrl: string;
  publishedAt: string | null;
  firstSeen: string;
  discoveredAfterBaseline: boolean;
  board: { platform: string; lastSuccessAt: string | null };
  recommendation: { label: string; reasons: string[]; skills: string[] };
  summary: string;
  otherSkills: string[];
  requirements: string[];
  warnings: string[];
  decisionRevision: number;
};
export type MatchSettings = {
  preferences: MatchPreferences | null;
  revision: number;
  hasCv: boolean;
  suggested: {
    titles: string[];
    skills: string[];
    locations: string[];
    arrangement: string;
  };
};
export type MatchRow = {
  fillSupported?: boolean;
  id: string;
  catalogId: string;
  state: string;
  reason: string | null;
  priority: number;
  revision: number;
  available: boolean;
  personalJobId: string | null;
  application: { id: string; status: string } | null;
  snapshot: Pick<
    MatchListing,
    "id" | "title" | "employer" | "location" | "salaryText" | "applyUrl"
  >;
};
export type MatchCollection = {
  rows: MatchRow[];
  total: number;
  counts: Record<string, number>;
  lastActionId: string | null;
  page: number;
};
