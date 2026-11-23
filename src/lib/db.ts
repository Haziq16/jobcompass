import { PrismaClient } from "@prisma/client";
import { workspaceId } from "./workspace-context";
const globalDb = globalThis as unknown as { db: PrismaClient };
export const authDb = globalDb.db || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.db = authDb;
const privateModels = new Set([
  "ApplicationFillSession",
  "CandidateProfile",
  "ApplicationAnswer",
  "ApplicationQuestion",
  "MatchPreferences",
  "MatchDecision",
  "MatchAction",
  "Profile",
  "Settings",
  "Job",
  "JobSource",
  "SearchDefinition",
  "SearchRun",
  "SearchRunJob",
  "ApiRequestLedger",
  "FetchIntent",
  "SavedJob",
  "Application",
  "ApplicationEvent",
  "ProfileVersion",
  "ResumeAsset",
  "AiGeneration",
  "AiReview",
  "AiCvDraft",
  "AiConnection",
  "DocumentDraft",
  "ApplicationAttempt",
]);
function scopedData(data: unknown, id: string, singleton: boolean): unknown {
  if (Array.isArray(data))
    return data.map((row) => scopedData(row, id, singleton));
  if (!data || typeof data !== "object") return data;
  return { ...data, workspaceId: id, ...(singleton ? { id } : {}) };
}
export const db = authDb.$extends({
  name: "account-workspace",
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (!privateModels.has(model)) return query(args);
        const id = workspaceId();
        const options = args as Record<string, unknown>;
        const singleton = model === "Profile" || model === "Settings";
        if (
          !["create", "createMany", "createManyAndReturn"].includes(operation)
        ) {
          const where = (options.where || {}) as Record<string, unknown>;
          options.where = {
            ...where,
            workspaceId: id,
            ...(singleton && where.id === "owner" ? { id } : {}),
          };
        }
        if (operation === "upsert")
          options.create = scopedData(options.create, id, singleton);
        if (["create", "createMany", "createManyAndReturn"].includes(operation))
          options.data = scopedData(options.data, id, singleton);
        // Account ownership is immutable on edits; schemas never accept nested writes.
        if (options.update && typeof options.update === "object")
          delete (options.update as Record<string, unknown>).workspaceId;
        if (
          operation.startsWith("update") &&
          options.data &&
          typeof options.data === "object"
        )
          delete (options.data as Record<string, unknown>).workspaceId;
        return query(args);
      },
    },
  },
});
