import { Suspense } from "react";
import JobWorkspace from "@/components/workspace/JobWorkspace";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Loading your jobs…</p>}>
      <JobWorkspace />
    </Suspense>
  );
}
