import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { workspaceId } from "./workspace-context";
import { AppError } from "./contracts";
import { credentials } from "./resume-review-contracts";

export const connectionInput = credentials
  .omit({ apiKey: true })
  .extend({
    apiKey: credentials.shape.apiKey.optional(),
    useSavedConnection: z.boolean().optional(),
  })
  .strict();
export const modelListInput = connectionInput.omit({ model: true });
function encryptionKey() {
  const value = process.env.PERSONAL_AI_ENCRYPTION_KEY || "";
  if (!/^[a-fA-F0-9]{64}$/.test(value))
    throw new AppError("connection_storage_unavailable", 503);
  return Buffer.from(value, "hex");
}
function aad(provider: string) {
  return Buffer.from(
    JSON.stringify(["jobcompass-ai-key-v1", workspaceId(), provider]),
  );
}
function seal(key: string, provider: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(aad(provider));
  const encrypted = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export async function savedConnection() {
  const row = await db.aiConnection.findUnique({
    where: { workspaceId: workspaceId() },
    select: { provider: true, model: true },
  });
  return row
    ? { provider: row.provider, model: row.model, saved: true as const }
    : null;
}
export async function resolvePersonalCredentials(
  raw: z.infer<typeof connectionInput>,
) {
  if (!raw.useSavedConnection) return credentials.parse(raw);
  if (raw.apiKey) throw new AppError("ambiguous_credentials", 400);
  const row = await db.aiConnection.findUnique({
    where: { workspaceId: workspaceId() },
  });
  if (!row || row.provider !== raw.provider)
    throw new AppError("saved_connection_missing", 409);
  const key = encryptionKey();
  let plaintext: string;
  try {
    const [version, iv, tag, ciphertext] = row.keyCiphertext.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(aad(row.provider));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError("saved_connection_unreadable", 409);
  }
  return credentials.parse({
    provider: raw.provider,
    model: raw.model,
    apiKey: plaintext,
  });
}
export async function saveConnection(raw: z.infer<typeof connectionInput>) {
  const config = await resolvePersonalCredentials(raw);
  const data = {
    provider: config.provider,
    model: config.model,
    keyCiphertext: seal(config.apiKey, config.provider),
  };
  await db.aiConnection.upsert({
    where: { workspaceId: workspaceId() },
    create: data,
    update: data,
  });
  return savedConnection();
}
