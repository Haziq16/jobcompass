"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import CatalogDiscovery from "./CatalogDiscovery";
import MatchWorkspace from "./MatchWorkspace";
import { useMatchAccess } from "./MatchAccess";
export default function DiscoveryHome() {
  const params = useSearchParams();
  const matches = useMatchAccess();
  if (!matches) return <CatalogDiscovery />;
  if (params.get("view") !== "list") return <MatchWorkspace />;
  return (
    <>
      <nav className="match-list-switch" aria-label="Discovery views">
        <Link href="/discover">Swipe matches</Link>
        <span aria-current="page">List view</span>
        <Link href="/queue">Application queue</Link>
      </nav>
      <CatalogDiscovery />
    </>
  );
}
