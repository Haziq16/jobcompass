import { Suspense } from "react";
import { ApplicationDetail } from "@/components/workspace/Applications";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<p>Loading application…</p>}>
      <ApplicationDetail id={id} />
    </Suspense>
  );
}
