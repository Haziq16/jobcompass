import { ownerAuth } from "./auth";
import { accessAllowed } from "./access";
import { AppError } from "./contracts";
export async function authorize(headers: Headers, method: string) {
  if (!accessAllowed(headers, method)) throw new AppError("forbidden", 403);
  if (process.env.APP_ACCESS === "local") return;
  const session = await ownerAuth().api.getSession({ headers });
  if (!session) throw new AppError("unauthenticated", 401);
  if (
    process.env.PUBLIC_SIGNUP !== "true" &&
    (!session.user.emailVerified ||
      session.user.email.toLowerCase() !==
        process.env.OWNER_EMAIL?.trim().toLowerCase())
  )
    throw new AppError("forbidden", 403);
  return session;
}
