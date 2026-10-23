import { Suspense } from "react";
import DiscoveryHome from "@/components/workspace/DiscoveryHome";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading discovery…</p>}>
      <DiscoveryHome />
    </Suspense>
  );
}
