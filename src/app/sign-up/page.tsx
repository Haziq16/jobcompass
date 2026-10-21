import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
export const dynamic = "force-dynamic";
export default function Page() {
  if (
    process.env.APP_ACCESS !== "hosted" ||
    process.env.PUBLIC_SIGNUP !== "true"
  )
    redirect("/sign-in");
  return <AuthForm signup />;
}
