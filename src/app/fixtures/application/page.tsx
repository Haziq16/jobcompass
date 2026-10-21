import { notFound } from "next/navigation";
import ControlledForm from "@/components/workspace/ControlledForm";
export const dynamic = "force-dynamic";
export default function Page() {
  if (process.env.APP_ACCESS !== "local") notFound();
  return <ControlledForm />;
}
