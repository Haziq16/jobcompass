export function canUseMatches(
  user?: { email: string },
  env: Record<string, string | undefined> = process.env,
) {
  const mode = env.MATCH_MODE || "owner";
  if (mode === "off") return false;
  if (env.APP_ACCESS === "local") return true;
  if (!user) return false;
  if (mode === "all") return true;
  return (
    mode === "owner" &&
    Boolean(env.OWNER_EMAIL) &&
    user.email.toLowerCase() === env.OWNER_EMAIL?.trim().toLowerCase()
  );
}
