import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/authorization";
import Shell from "@/components/workspace/Shell";
import { canUsePersonalAi } from "@/lib/ai-access";
import { PersonalAiContext } from "@/components/workspace/PersonalAiContext";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  let name: string | undefined;
  let ai = false;
  try {
    const session = await authorize(await headers(), "GET");
    name = session?.user.name;
    ai = canUsePersonalAi(session?.user);
  } catch {
    if (process.env.APP_ACCESS === "hosted") redirect("/sign-in");
  }
  return (
    <PersonalAiContext enabled={ai}>
      <Shell hosted={process.env.APP_ACCESS === "hosted"} name={name}>
        {children}
      </Shell>
    </PersonalAiContext>
  );
}
