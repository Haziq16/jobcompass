import { aiRequest } from "@/lib/ai-access";
import { apiError, readJson } from "@/lib/http";
import { db } from "@/lib/db";
import {
  connectionInput,
  savedConnection,
  saveConnection,
} from "@/lib/personal-ai-connection";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(req: Request) {
  return aiRequest(req, async () => {
    try {
      return Response.json({ connection: await savedConnection() });
    } catch (error) {
      return apiError(error);
    }
  });
}
export function PUT(req: Request) {
  return aiRequest(req, async () => {
    try {
      return Response.json({
        connection: await saveConnection(
          connectionInput.parse(await readJson(req)),
        ),
      });
    } catch (error) {
      return apiError(error);
    }
  });
}
export function DELETE(req: Request) {
  return aiRequest(req, async () => {
    try {
      await db.aiConnection.deleteMany();
      return Response.json({ deleted: true });
    } catch (error) {
      return apiError(error);
    }
  });
}
