import { Suspense } from "react";
import CatalogDiscovery from "@/components/workspace/CatalogDiscovery";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading discovery…</p>}>
      <CatalogDiscovery />
    </Suspense>
  );
}
