import { authorize } from "@/lib/authorization";
import { aiMode, canUsePersonalAi } from "@/lib/ai-access";
import { apiError } from "@/lib/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const session = await authorize(req.headers, "GET");
    return Response.json({
      enabled: canUsePersonalAi(session?.user),
      mode: aiMode(),
      keyStorage: "tab_memory_only",
      ownerBilling: false,
    });
  } catch (error) {
    return apiError(error);
  }
}
