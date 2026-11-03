import { redirect } from "next/navigation";
import SignIn from "@/components/AuthForm";
export const dynamic = "force-dynamic";
export default function SignInPage() {
  if (process.env.APP_ACCESS !== "hosted") redirect("/");
  return <SignIn publicSignup={process.env.PUBLIC_SIGNUP === "true"} />;
}
