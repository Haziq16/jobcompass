import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { authDb } from "./db";

export function createOwnerAuth(provisioning = false) {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.APP_URL;
  const publicSignup = process.env.PUBLIC_SIGNUP === "true";
  if ((!owner && !publicSignup) || !secret || secret.length < 32 || !baseURL)
    throw new Error("Hosted authentication is not configured.");
  return betterAuth({
    appName: "JobCompass",
    secret,
    baseURL,
    database: prismaAdapter(authDb, {
      provider: "postgresql",
      transaction: true,
    }),
    trustedOrigins: [baseURL],
    emailAndPassword: {
      enabled: true,
      disableSignUp: !publicSignup && !provisioning,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 12,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
      },
    },
    user: { changeEmail: { enabled: false }, deleteUser: { enabled: false } },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (publicSignup && !provisioning)
              return {
                data: {
                  ...user,
                  email: user.email.trim().toLowerCase(),
                  emailVerified: false,
                },
              };
            if (!provisioning || user.email.toLowerCase() !== owner)
              throw new APIError("FORBIDDEN", {
                message: "Registration is closed.",
              });
            return { data: { ...user, email: owner!, emailVerified: true } };
          },
        },
      },
    },
    advanced: {
      useSecureCookies: new URL(baseURL).protocol === "https:",
      ipAddress: {
        ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"],
      },
    },
    logger: { level: "error" },
  });
}
let instance: ReturnType<typeof createOwnerAuth> | undefined;
export function ownerAuth() {
  return (instance ??= createOwnerAuth());
}
