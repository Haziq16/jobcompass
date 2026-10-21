import { Suspense } from "react";
import JobBrowser from "@/components/workspace/JobBrowser";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading opportunities…</p>}>
      <JobBrowser />
    </Suspense>
  );
}
