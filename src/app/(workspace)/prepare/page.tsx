import { Suspense } from "react";
import ApplicationPreparation from "@/components/workspace/ApplicationPreparation";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Loading application preparation…</p>}>
      <ApplicationPreparation />
    </Suspense>
  );
}
