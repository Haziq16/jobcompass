"use client";
import { type ReactNode } from "react";
import { type ApplyLink, type ProviderSearchInput } from "@/lib/contracts";
import { matchJob, type MatchProfile } from "@/lib/matching";

export type Profile = MatchProfile & { cvText: string };
export type AppData = {
  status: string;
  notes: string;
  url: string | null;
  appliedAt: string | null;
  followUpAt: string | null;
  events: { id: string; status: string; createdAt: string }[];
};
export type Job = {
  id: string;
  title: string;
  employer: string;
  location: string | null;
  country: string | null;
  description: string | null;
  qualifications: string[];
  remote: boolean | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  salaryText: string | null;
  publishedAt: string | null;
  lastFetched: string;
  hidden: boolean;
  sources: {
    publisher: string | null;
    sourceUrl: string | null;
    applyLinks: ApplyLink[];
  }[];
  saved: { notes: string; tags: string[] } | null;
  application: AppData | null;
  match: ReturnType<typeof matchJob>;
};
export type Settings = {
  providerPaused: boolean;
  allowance: number;
  budget: number;
  dailyCap: number;
  cacheHours: number;
  timezone: string;
  cycleStart: string;
  cycleEnd: string;
};
export type Usage = {
  settings: Settings;
  monthly: number;
  daily: number;
  connected: boolean;
  planConfirmed: boolean;
  expired: boolean;
  ledger: {
    id: string;
    createdAt: string;
    state: string;
    units: number;
    errorCategory: string | null;
  }[];
};
export type Run = {
  id: string;
  input: ProviderSearchInput;
  fetchedAt: string;
  expiresAt: string;
  nextCursor: string | null;
  _count?: { jobs: number };
};
export type SearchDef = {
  id: string;
  name: string;
  input: ProviderSearchInput;
};
export const initialProfile: Profile = {
  skills: [],
  titles: [],
  locations: [],
  excluded: [],
  years: null,
  arrangement: "any",
  cvText: "",
  aliases: {},
};
export const initialInput: ProviderSearchInput = {
  query: "Android developer in Malaysia",
  country: "my",
  datePosted: "all",
  remoteOnly: false,
};
export const countries = [
  ["my", "Malaysia"],
  ["sg", "Singapore"],
  ["gb", "United Kingdom"],
  ["us", "United States"],
  ["au", "Australia"],
  ["in", "India"],
];
export const errors: Record<string, string> = {
  provider_paused:
    "Discovery is paused after a provider quota response. Review your dashboard, reconcile usage and resume in Settings.",
  database_unavailable:
    "Start PostgreSQL and apply migrations to connect your workspace. See README.md for the two setup commands.",
  disconnected:
    "Configure JSEARCH_API_KEY in the server environment, then restart or redeploy. Your stored jobs are still available.",
  confirm_plan:
    "Confirm your plan in the provider dashboard, then set JSEARCH_PLAN_CONFIRMED=true in .env.",
  daily_limit:
    "Daily discovery budget reached. Browse your stored jobs or return tomorrow.",
  monthly_limit:
    "Monthly discovery budget reached. Stored jobs remain available.",
  cycle_expired:
    "Review your provider reset date in Settings before fetching again.",
  provider_quota:
    "JSearch has reached a rate or quota limit. Check the provider dashboard before retrying.",
  connection_error:
    "JSearch could not authorize this request. Check your key and account access.",
  timeout:
    "JSearch timed out. This request may have used a credit. Your stored jobs are safe.",
  provider_error:
    "JSearch is unavailable. Your stored jobs are safe; retry only when you choose.",
  malformed_response:
    "JSearch returned an unexpected response. Stored jobs were preserved.",
  invalid_input: "Please check your fields and try again.",
  cv_too_large: "Choose a PDF or DOCX smaller than 5 MB.",
  unsupported_cv:
    "Choose a valid PDF or DOCX without macros or embedded files.",
  cv_unreadable:
    "This file could not be read. Try an unencrypted PDF, or paste its text.",
  cv_no_text: "No text found. Paste your CV text instead.",
  forbidden: "This private workspace can only be accessed on localhost.",
};
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch("/api/" + path, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      errors[value.error] ||
        "Something went wrong. Your stored data has been preserved.",
    );
  return value;
}
export function date(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Unknown";
}
export function salary(j: Job) {
  if (j.salaryText) return j.salaryText;
  if (j.salaryMin !== null || j.salaryMax !== null)
    return `${j.salaryCurrency || "Currency not supplied"} ${j.salaryMin?.toLocaleString() || "?"}${j.salaryMax !== null ? " – " + j.salaryMax.toLocaleString() : ""}${j.salaryPeriod ? " / " + j.salaryPeriod.toLowerCase() : ""}`;
  return "Salary not disclosed";
}
export function IconButton({
  label,
  children,
  onClick,
  active = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      className={"icon-button " + (active ? "active" : "")}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function demoJobs(): Job[] {
  const titles = [
    "Android Developer",
    "Mobile Software Engineer",
    "Junior Android Developer",
    "Android Engineer, Product",
    "Project Coordinator",
    "Associate Mobile Developer",
  ];
  const employers = [
    "Northstar Studio",
    "Forma Labs",
    "Evergreen Digital",
    "Orbit Works",
    "Fieldwork",
    "Kindred Technologies",
  ];
  const p: Profile = {
    ...initialProfile,
    skills: ["Kotlin", "Jetpack Compose", "Java", "Firebase"],
    titles: ["Android Developer"],
    locations: ["Kuala Lumpur", "Malaysia"],
  };
  return titles.map((title, i) => {
    const j = {
      id: "demo-" + i,
      title,
      employer: employers[i],
      location: i === 1 ? "Remote, Malaysia" : "Kuala Lumpur, Malaysia",
      country: "my",
      description:
        "DEMO LISTING — This is a fictional opportunity for exploring JobCompass.\n\nHelp build thoughtful mobile experiences in a small, collaborative product team. Work closely with designers and engineers to turn customer needs into reliable, accessible Android features.\n\nWhat you’ll work on\n• Develop and maintain Android applications using Kotlin and Jetpack Compose.\n• Collaborate on product decisions and improve application performance.\n• Write clear, maintainable code and participate in code reviews.\n\nThis listing is fictional and cannot be applied to.",
      qualifications: [
        "Experience with Kotlin and Android",
        "Familiarity with Jetpack Compose and Firebase",
      ],
      remote: i === 1,
      employmentType: "Full-time",
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      salaryText: null,
      publishedAt: null,
      lastFetched: new Date().toISOString(),
      hidden: false,
      sources: [
        { publisher: "Fictional demo", sourceUrl: null, applyLinks: [] },
      ],
      saved: null,
      application: null,
    };
    return { ...j, match: matchJob(j, p) };
  });
}
