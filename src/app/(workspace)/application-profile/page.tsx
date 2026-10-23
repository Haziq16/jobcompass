import { Suspense } from "react";
import ApplicationProfile from "@/components/workspace/ApplicationProfile";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading application profile�</p>}>
      <ApplicationProfile />
    </Suspense>
  );
}
