import { accountRequest } from "@/lib/account-request";
import { authDb } from "@/lib/db";
import { saveCatalogJob } from "@/lib/catalog";
import { apiError } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export function GET(req: Request, context: Context) {
  return accountRequest(req, async () => {
    const { id } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(id))
      return Response.json({ error: "not_found" }, { status: 404 });
    const job = await authDb.catalogJob.findUnique({
      where: { id },
      include: {
        board: { select: { name: true, platform: true, lastSuccessAt: true } },
      },
    });
    if (!job) return Response.json({ error: "not_found" }, { status: 404 });
    const {
      hash: _hash,
      searchText: _searchText,
      skillKeys: _keys,
      skillKeysVersion: _version,
      skillKeysHash: _keysHash,
      ...publicJob
    } = job;
    void _hash;
    void _searchText;
    void _keys;
    void _version;
    void _keysHash;
    return Response.json(publicJob);
  });
}
export function POST(req: Request, context: Context) {
  return accountRequest(req, async () => {
    try {
      const { id } = await context.params;
      if (!/^[a-f0-9]{64}$/.test(id))
        return Response.json({ error: "not_found" }, { status: 404 });
      return Response.json(await saveCatalogJob(id));
    } catch (error) {
      return apiError(error);
    }
  });
}
