import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "./contracts";
export async function boundedBytes(req: Request, limit = 400000) {
  const reader = req.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader)
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new AppError("payload_too_large", 413);
      }
      chunks.push(value);
    }
  return Buffer.concat(chunks);
}
export async function readJson(req: Request) {
  try {
    return JSON.parse((await boundedBytes(req)).toString("utf8"));
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("invalid_json");
  }
}
export function apiError(e: unknown) {
  if (e instanceof AppError)
    return Response.json({ error: e.code }, { status: e.status });
  if (e instanceof z.ZodError)
    return Response.json({ error: "invalid_input" }, { status: 400 });
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
    return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ error: "database_unavailable" }, { status: 503 });
}
