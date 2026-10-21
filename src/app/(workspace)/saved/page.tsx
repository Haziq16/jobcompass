import { Suspense } from "react";
import JobBrowser from "@/components/workspace/JobBrowser";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading saved jobs…</p>}>
      <JobBrowser saved />
    </Suspense>
  );
}
