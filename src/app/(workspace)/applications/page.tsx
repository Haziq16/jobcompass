import { Suspense } from "react";
import { Applications } from "@/components/workspace/Applications";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading applications…</p>}>
      <Applications />
    </Suspense>
  );
}
