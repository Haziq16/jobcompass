import { AsyncLocalStorage } from "node:async_hooks";
import { AppError } from "./contracts";
const context = new AsyncLocalStorage<string>();
export function workspaceId() {
  const id = context.getStore();
  if (id) return id;
  if (process.env.APP_ACCESS === "local" && !process.env.VERCEL) return "local";
  if (process.env.JOBCOMPASS_TEST === "true") return "local";
  throw new AppError("workspace_required", 401);
}
export function inWorkspace<T>(
  id: string,
  action: () => Promise<T>,
): Promise<T> {
  // Prisma promises are lazy: consume them inside the context, before returning.
  return context.run(id, async () => await action());
}
