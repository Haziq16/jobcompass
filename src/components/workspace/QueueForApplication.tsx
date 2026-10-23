"use client";
import { useRef, useState } from "react";
import { api, useResource } from "./client";
import ApplicationFill from "./ApplicationFill";
export default function QueueForApplication({
  catalogId,
  preferredResumeId,
}: {
  catalogId: string;
  preferredResumeId?: string;
}) {
  const resource = useResource<{
    decision: { state: string; revision: number } | null;
  }>(`job-workspace?decision=${catalogId}`);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef<string | null>(null);
  async function queue() {
    if (!resource.data || busy) return;
    request.current ||= crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      await api("matches/decision", "POST", {
        requestId: request.current,
        catalogId,
        state: "queued",
        expectedRevision: resource.data.decision?.revision || 0,
        reason: null,
      });
      resource.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (resource.data?.decision?.state === "queued")
    return (
      <ApplicationFill
        catalogId={catalogId}
        preferredResumeId={preferredResumeId}
      />
    );
  return (
    <section>
      <h2>Connect this application</h2>
      <p>
        Add this job to your application queue before choosing how to fill it.
        This step does not authorize sending your CV or submitting.
      </p>
      {resource.loading && <p role="status">Checking queue…</p>}
      {(resource.error || error) && (
        <p role="alert">{resource.error || error}</p>
      )}
      <button disabled={busy || !resource.data} onClick={queue}>
        {busy ? "Adding to queue…" : "Add to application queue"}
      </button>
    </section>
  );
}
