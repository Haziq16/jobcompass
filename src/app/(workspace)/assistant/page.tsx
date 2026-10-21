import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { authorize } from "@/lib/authorization";
import { canUsePersonalAi } from "@/lib/ai-access";
import AiStudio from "@/components/workspace/AiStudio";
export default async function Page() {
  const session = await authorize(await headers(), "GET");
  if (!canUsePersonalAi(session?.user)) notFound();
  return (
    <Suspense fallback={<p>Loading AI studio…</p>}>
      <AiStudio />
    </Suspense>
  );
}
