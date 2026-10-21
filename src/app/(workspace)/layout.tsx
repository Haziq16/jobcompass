import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/authorization";
import Shell from "@/components/workspace/Shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  let name: string | undefined;
  try {
    const session = await authorize(await headers(), "GET");
    name = session?.user.name;
  } catch {
    if (process.env.APP_ACCESS === "hosted") redirect("/sign-in");
  }
  return (
    <Shell hosted={process.env.APP_ACCESS === "hosted"} name={name}>
      {children}
    </Shell>
  );
}
