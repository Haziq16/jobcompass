import { Suspense } from "react";
import MatchWorkspace from "@/components/workspace/MatchWorkspace";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading your application queue…</p>}>
      <MatchWorkspace />
    </Suspense>
  );
}
