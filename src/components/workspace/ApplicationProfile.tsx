"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMatchAccess } from "./MatchAccess";
import { useResource } from "./client";
import type { CandidateResult } from "@/lib/application-memory";
import CandidateEditor from "./CandidateEditor";
import AnswerMemory from "./AnswerMemory";
export default function ApplicationProfile() {
  const enabled = useMatchAccess();
  return enabled ? (
    <Profile />
  ) : (
    <section>
      <h1>Application profile</h1>
      <p>This feature is currently an owner preview.</p>
      <Link href="/profile">Back to your profile</Link>
    </section>
  );
}
function Profile() {
  const params = useSearchParams(),
    tab = params.get("tab"),
    view = tab === "answers" || tab === "inbox" ? tab : "profile",
    job = params.get("job"),
    catalogId = job && /^[a-f0-9]{64}$/.test(job) ? job : null;
  const resource = useResource<CandidateResult>("application-profile/profile");
  const [notice, setNotice] = useState("");
  function href(tab: string) {
    return (
      "/application-profile?tab=" + tab + (catalogId ? "&job=" + catalogId : "")
    );
  }
  return (
    <div className="candidate-workspace">
      <header className="candidate-page-header">
        <div>
          <p className="candidate-eyebrow">Your application information</p>
          <h1>Application profile</h1>
          <p>
            Confirm your details once and remember the answers employers ask
            for. You stay in control of every fact.
          </p>
        </div>
        <div className="candidate-progress">
          <strong>
            {resource.data?.sections.filter((s) => s.confirmed).length || 0}
            <span> / 7</span>
          </strong>
          <p>sections confirmed</p>
          <Link href="/queue">Back to application queue</Link>
        </div>
      </header>
      <nav className="candidate-tabs" aria-label="Application profile sections">
        {[
          ["profile", "Your information"],
          ["answers", "Answer library"],
          ["inbox", "Answers needed"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={href(key)}
            aria-current={view === key ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <p className="candidate-help">
        Private owner preview. Saved information supplies answers only after
        confirmation. Automatic filling and submission are not enabled.
      </p>
      {notice && (
        <p className="candidate-notice" role="status">
          {notice}
        </p>
      )}
      {view === "profile" ? (
        resource.error ? (
          <div role="alert">
            <p>Could not load your application profile.</p>
            <button onClick={resource.refresh}>Try again</button>
          </div>
        ) : resource.data ? (
          <CandidateEditor
            key={resource.data.revision}
            data={resource.data}
            onSaved={resource.refresh}
            onNotice={setNotice}
          />
        ) : (
          <p role="status">Loading your private profile�</p>
        )
      ) : (
        <AnswerMemory
          key={view}
          view={view}
          catalogId={catalogId}
          onNotice={setNotice}
        />
      )}
    </div>
  );
}
