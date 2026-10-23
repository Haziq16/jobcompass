import ApplicationFill from "@/components/workspace/ApplicationFill";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ catalogId: string }>;
}) {
  const { catalogId } = await params;
  if (!/^[a-f0-9]{64}$/.test(catalogId)) notFound();
  return <ApplicationFill catalogId={catalogId} />;
}
