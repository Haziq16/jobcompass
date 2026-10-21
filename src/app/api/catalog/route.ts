import { accountRequest } from "@/lib/account-request";
import { listCatalog } from "@/lib/catalog";
import { apiError } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return accountRequest(req, async () => {
    try {
      return Response.json(await listCatalog(new URL(req.url).searchParams));
    } catch (error) {
      return apiError(error);
    }
  });
}
