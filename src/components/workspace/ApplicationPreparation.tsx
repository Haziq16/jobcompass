"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { api, useResource } from "./client";
import { usePersonalAi } from "./PersonalAiContext";
import { TailoredCv } from "./TailoredCv";
import ApplicationMaterials from "./ApplicationMaterials";
import QueueForApplication from "./QueueForApplication";
import { AtsReport } from "./AtsReport";
import { StudioApply } from "./StudioApply";
import type { Run, Job } from "./ai-studio-types";
import type { ResumeChecks } from "@/lib/resume-checks";
type Context = {
  job: Job;
  resumes: { id: string; name: string; isDefault: boolean }[];
  selected: { id: string; name: string; text: string } | null;
  checks: ResumeChecks;
  reviews: { id: string; state: string; createdAt: string }[];
};
const steps = [
  ["cv", "Your CV"],
  ["keywords", "Missing keywords"],
  ["documents", "Tailored CV"],
  ["answers", "Letter & answers"],
  ["apply", "Apply & track"],
] as const;
export default function ApplicationPreparation() {
  const params = useSearchParams(),
    { enabled } = usePersonalAi();
  const jobId = params.get("jobId");
  if (!jobId)
    return (
      <section className="job-workspace-empty">
        <h1>Prepare an application</h1>
        <p>Choose an opportunity to begin.</p>
        <Link href="/my-jobs">Find a job</Link>
      </section>
    );
  if (!enabled)
    return (
      <section className="job-workspace-empty">
        <h1>Application preparation</h1>
        <p>
          AI preparation is currently an owner preview. Your saved jobs and
          application tracking remain available.
        </p>
        <Link href="/applications">Open Applications</Link>
      </section>
    );
  return (
    <Preparation
      key={`${params.get("source")}:${jobId}`}
      jobId={jobId}
      source={params.get("source") === "workspace" ? "workspace" : "catalog"}
    />
  );
}
function Preparation({
  jobId,
  source,
}: {
  jobId: string;
  source: "catalog" | "workspace";
}) {
  const router = useRouter(),
    params = useSearchParams(),
    { config } = usePersonalAi();
  const step = steps.some(([key]) => key === params.get("step"))
    ? params.get("step")!
    : "cv";
  const context = useResource<Context>(
    `ai/preparation?source=${source}&jobId=${encodeURIComponent(jobId)}&resumeId=${encodeURIComponent(params.get("resumeId") || "")}`,
  );
  const [run, setRun] = useState<Run | null>(null),
    [facts, setFacts] = useState<Record<string, string>>({}),
    [selected, setSelected] = useState<string[]>([]),
    [reviewed, setReviewed] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef<{ key: string; id: string } | null>(null);
  const reviewId = params.get("review") || "";
  useEffect(() => {
    if (!reviewId) {
      setRun(null);
      return;
    }
    let current = true;
    api<Run>(`ai/reviews/${encodeURIComponent(reviewId)}`)
      .then((value) => {
        if (!current) return;
        if (
          value.jobSnapshot.id !== jobId ||
          value.jobSnapshot.source !== source
        ) {
          setRun(null);
          setError(
            "This review belongs to a different job. Choose a preparation for this opportunity.",
          );
          return;
        }
        setRun(value);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [reviewId, jobId, source]);
  const data = context.data;
  function navigate(next: string, review = reviewId) {
    const query = new URLSearchParams(params.toString());
    query.set("step", next);
    if (review) query.set("review", review);
    if (review !== reviewId) query.delete("preparedCv");
    router.push(`/prepare?${query}`, { scroll: false });
  }
  async function analyze() {
    if (!data?.selected || busy || !reviewed || !consent) return;
    const keywordEvidence = selected.map((term) => ({
      term,
      evidence: facts[term]?.trim() || "",
      reviewed: true,
    }));
    if (keywordEvidence.some((f) => f.evidence.length < 20)) {
      setError(
        "Describe real experience for every selected keyword, including the skill name. At least 20 characters are needed.",
      );
      return;
    }
    const input = {
      source,
      jobId,
      resumeText: data.selected.text,
      ...(data.selected.name.toLowerCase().endsWith(".docx")
        ? { sourceAssetId: data.selected.id }
        : {}),
      keywordEvidence,
      provider: config.provider,
      model: config.model,
    };
    const key = JSON.stringify(input);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const result = await api<Run>("ai/reviews", "POST", {
        ...input,
        requestKey: request.current.id,
        consent: true,
        reviewed: true,
        ...(config.saved
          ? { useSavedConnection: true }
          : { apiKey: config.apiKey }),
      });
      setRun(result);
      navigate("documents", result.id);
      if (result.state !== "succeeded")
        setError(
          result.error ||
            "The request is recorded. No automatic retry was made.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section>
        <h1>Prepare application</h1>
        {context.loading ? (
          <p role="status">Loading your job and CV library…</p>
        ) : (
          <p role="alert">
            {context.error || "Could not load this application."}{" "}
            <button onClick={context.refresh}>Refresh</button>
          </p>
        )}
      </section>
    );
  return (
    <div className="application-preparation">
      <header className="job-workspace-heading">
        <div>
          <Link href="/my-jobs">
            <ArrowLeft size={14} /> My jobs
          </Link>
          <h1>{data.job.title}</h1>
          <p>{data.job.employer} · Application preparation</p>
        </div>
        <Link
          href={`/assistant?source=${source}&jobId=${encodeURIComponent(jobId)}`}
        >
          Provider settings & detailed review
        </Link>
      </header>
      <nav className="preparation-steps" aria-label="Application preparation">
        {steps.map(([key, label], index) => (
          <button
            key={key}
            aria-current={key === step ? "step" : undefined}
            onClick={() => navigate(key)}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      {(error || context.error) && (
        <p role="alert" className="job-workspace-message">
          {error || context.error}
        </p>
      )}
      {step === "cv" && (
        <section className="preparation-stage">
          <h2>Choose the CV for this application</h2>
          <p>
            Your original stays unchanged. Tailored documents are saved as
            separate versions.
          </p>
          {data.resumes.length ? (
            <label>
              CV library
              <select
                value={data.selected?.id || ""}
                onChange={(e) => {
                  const query = new URLSearchParams(params.toString());
                  query.set("resumeId", e.target.value);
                  query.delete("review");
                  query.delete("preparedCv");
                  setRun(null);
                  setFacts({});
                  setSelected([]);
                  setReviewed(false);
                  setConsent(false);
                  router.push(`/prepare?${query}`, { scroll: false });
                }}
              >
                <option value="" disabled>
                  Choose a CV
                </option>
                {data.resumes.map((resume) => (
                  <option value={resume.id} key={resume.id}>
                    {resume.name}
                    {resume.isDefault ? " · default" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>
              No CV saved yet.{" "}
              <Link href="/application-profile">
                Upload and confirm your CV in Application profile
              </Link>
              .
            </p>
          )}
          {data.selected && (
            <>
              <details>
                <summary>Read the extracted CV text</summary>
                <pre className="preparation-source">{data.selected.text}</pre>
              </details>
              <p>
                {data.selected.name.toLowerCase().endsWith(".docx")
                  ? "Original Word formatting is available when generating the tailored CV. Review final pagination."
                  : "This source can be analyzed and uploaded as originally saved. Preserving its original editable layout requires a Word/DOCX template."}
              </p>
              <label className="preparation-check">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I’ve checked this CV and the information is accurate.
              </label>
              <details className="preparation-ats">
                <summary>Inspect parser output & ATS findings</summary>
                <AtsReport
                  text={data.selected.text}
                  jobText={data.job.description}
                  sourceAssetId={data.selected.id}
                />
              </details>
              <button
                className="job-workspace-primary"
                disabled={!reviewed}
                onClick={() => navigate("keywords")}
              >
                Check missing keywords <ArrowRight size={16} />
              </button>
            </>
          )}
          {data.reviews.length > 0 && (
            <details>
              <summary>Previous preparation</summary>
              {data.reviews.map((review) => (
                <button
                  key={review.id}
                  onClick={() => navigate("documents", review.id)}
                >
                  {new Date(review.createdAt).toLocaleDateString()} ·{" "}
                  {review.state}
                </button>
              ))}
            </details>
          )}
        </section>
      )}
      {step === "keywords" && (
        <section className="preparation-stage">
          <h2>Bring relevant experience into focus</h2>
          <p>
            {data.checks.mentioned} of {data.checks.total} detected job terms
            appear in this CV. This is a wording check, not an employer ATS
            score.
          </p>
          <div className="job-workspace-skills">
            {data.checks.keywords
              .filter((k) => k.mentioned)
              .map((keyword) => (
                <span key={keyword.name}>
                  <Check size={13} />
                  {keyword.name}
                </span>
              ))}
          </div>
          <h3>Terms not found in your CV</h3>
          <p>
            Select only skills you have and describe where you used them.
            Unselected terms remain gaps; they won’t be added as experience.
          </p>
          {data.checks.keywords
            .filter((k) => !k.mentioned)
            .map((keyword) => (
              <div className="preparation-keyword" key={keyword.name}>
                <label className="preparation-check">
                  <input
                    type="checkbox"
                    checked={selected.includes(keyword.name)}
                    onChange={(e) =>
                      setSelected((v) =>
                        e.target.checked
                          ? [...v, keyword.name]
                          : v.filter((t) => t !== keyword.name),
                      )
                    }
                  />
                  I have experience with {keyword.name}
                </label>
                {selected.includes(keyword.name) && (
                  <label>
                    Confirmed experience with {keyword.name}
                    <textarea
                      rows={3}
                      value={facts[keyword.name] || ""}
                      onChange={(e) =>
                        setFacts((v) => ({
                          ...v,
                          [keyword.name]: e.target.value,
                        }))
                      }
                      placeholder={`Describe your real ${keyword.name} work or project. Include the skill name.`}
                    />
                  </label>
                )}
              </div>
            ))}
          <label className="preparation-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Send this CV and job description to {config.provider} /{" "}
            {config.model || "your selected model"} for review. Provider charges
            may apply. Confirmed additions will be available for tailoring.
          </label>
          <button
            className="job-workspace-primary"
            disabled={
              busy ||
              !reviewed ||
              !consent ||
              !config.model ||
              (!config.saved && !config.apiKey)
            }
            onClick={analyze}
          >
            {busy ? "Analyzing your evidence…" : "Analyze & prepare CV"}
          </button>
          {!reviewed && (
            <p>Confirm your CV in the first step before analyzing.</p>
          )}
          {!config.model && (
            <p>
              Choose and save a personal provider in{" "}
              <Link
                href={`/assistant?source=${source}&jobId=${encodeURIComponent(jobId)}`}
              >
                AI Studio settings
              </Link>
              .
            </p>
          )}
        </section>
      )}
      {step === "documents" &&
        (run?.state === "succeeded" ? (
          <section className="preparation-stage">
            <TailoredCv
              review={run}
              onConnect={() =>
                router.push(
                  `/assistant?source=${source}&jobId=${encodeURIComponent(jobId)}`,
                )
              }
              errorMessage={(code) => code.replaceAll("_", " ")}
              onUseForApplication={(asset) => {
                const query = new URLSearchParams(params.toString());
                query.set("preparedCv", asset.id);
                query.set("step", "answers");
                router.push(`/prepare?${query}`, { scroll: false });
              }}
            />
            <button onClick={() => navigate("answers")}>
              Continue to letter & answers <ArrowRight size={16} />
            </button>
          </section>
        ) : (
          <section className="preparation-stage">
            <h2>
              {run ? `Review ${run.state}` : "Start with your CV and keywords"}
            </h2>
            <p>
              {run?.error ||
                "A completed evidence review connects your source CV to this job. No generation is started just by opening this page."}
            </p>
            <button onClick={() => navigate("cv")}>Choose & check CV</button>
          </section>
        ))}
      {step === "answers" && (
        <section className="preparation-stage">
          {run?.state === "succeeded" ? (
            <ApplicationMaterials
              reviewId={run.id}
              catalogId={source === "catalog" ? jobId : null}
              employer={data.job.employer}
            />
          ) : (
            <>
              <h2>Review your CV first</h2>
              <p>
                The letter and narrative answers use the same reviewed job and
                CV evidence.
              </p>
              <button onClick={() => navigate("documents")}>
                Open CV preparation
              </button>
            </>
          )}
          <div className="job-workspace-actions">
            <Link
              href={`/application-profile?tab=answers${source === "catalog" ? `&job=${jobId}` : ""}`}
            >
              Application answer library
            </Link>
            <button onClick={() => navigate("apply")}>
              Continue to application <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}
      {step === "apply" && (
        <section className="preparation-stage">
          <p>
            Preparation does not authorize sending documents to an employer.
            Review the selected CV, recipient and submission rules below.
            Automatic rules keep their configured CV until you deliberately
            change them.
          </p>
          {source === "catalog" ? (
            <QueueForApplication
              catalogId={jobId}
              preferredResumeId={params.get("preparedCv") || undefined}
            />
          ) : (
            <StudioApply
              job={data.job}
              onDocuments={() => navigate("documents")}
              onCv={() => navigate("cv")}
            />
          )}
        </section>
      )}
    </div>
  );
}
