import { authorize } from "./authorization";
import { apiError } from "./http";
import { inWorkspace } from "./workspace-context";
export async function accountRequest(
  req: Request,
  action: () => Promise<Response>,
) {
  try {
    const session = await authorize(req.headers, req.method);
    return await inWorkspace(session?.user.id || "local", action);
  } catch (error) {
    return apiError(error);
  }
}
