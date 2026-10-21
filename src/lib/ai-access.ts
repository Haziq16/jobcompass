import { authorize } from "./authorization";
import { inWorkspace } from "./workspace-context";
import { AppError } from "./contracts";
import { apiError } from "./http";

export function aiMode() {
  const value = process.env.AI_MODE;
  return value === "owner" || value === "byok" ? value : "off";
}
export function canUsePersonalAi(user?: { email: string } | null) {
  const mode = aiMode();
  if (mode === "off") return false;
  if (mode === "byok")
    return Boolean(
      user || (process.env.APP_ACCESS === "local" && !process.env.VERCEL),
    );
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(owner && user?.email.toLowerCase() === owner);
}
export async function aiRequest(req: Request, action: () => Promise<Response>) {
  try {
    const session = await authorize(req.headers, req.method);
    if (aiMode() === "off") throw new AppError("ai_disabled", 410);
    if (!canUsePersonalAi(session?.user))
      throw new AppError("ai_not_available", 403);
    return await inWorkspace(session?.user.id || "local", action);
  } catch (error) {
    return apiError(error);
  }
}
