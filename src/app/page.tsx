import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/authorization";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (process.env.APP_ACCESS === "hosted") {
    try {
      await authorize(await headers(), "GET");
    } catch {
      redirect("/sign-in");
    }
  }
  redirect("/jobs");
}
