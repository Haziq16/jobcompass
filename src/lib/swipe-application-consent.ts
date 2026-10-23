import { createHmac, timingSafeEqual } from "node:crypto";
import { db, authDb } from "./db";
import { workspaceId } from "./workspace-context";
import { AppError } from "./contracts";
import { getCandidate } from "./application-memory";
import { ownedCvSource } from "./cv-source";
import { resolvedApplicationReadiness } from "./application-readiness";
import {
  automationSettingsSchema,
  fillTarget,
  targetInfo,
} from "./application-fill-contracts";
export async function swipeApplicationContext(
  resumeAssetId?: string,
  submit?: boolean,
) {
  const row = await db.automationSettings.findUnique({
    where: { workspaceId: workspaceId() },
  });
  if (
    !row ||
    process.env.AUTOMATION_MODE === "off" ||
    process.env.FILL_MODE === "off" ||
    process.env.MATCH_MODE === "off"
  )
    return null;
  const config = automationSettingsSchema.parse(row.values);
  if (
    !config.enabled ||
    (process.env.AUTOMATION_WORKER_SECRET || "").length < 32
  )
    return null;
  if (process.env.APP_ACCESS !== "local") {
    const user = await authDb.user.findUnique({
      where: { id: workspaceId() },
      select: { email: true },
    });
    if (
      user?.email.toLowerCase() !==
      process.env.OWNER_EMAIL?.trim().toLowerCase()
    )
      return null;
  }
  const profile = await getCandidate();
  if (!profile.sections.some((s) => s.section === "contact" && s.confirmed))
    return null;
  const cv = await ownedCvSource(resumeAssetId || config.resumeAssetId);
  return {
    assetId: cv.id,
    sha256: cv.sha256,
    cvName: cv.name,
    profileRevision: profile.revision,
    settingsRevision: row.revision,
    submit: submit === undefined ? config.submit : config.submit && submit,
    selection: resumeAssetId || submit !== undefined ? "job" : "rules",
    platforms: config.platforms,
  };
}
type Context = NonNullable<Awaited<ReturnType<typeof swipeApplicationContext>>>;
function signature(data: string) {
  return createHmac("sha256", process.env.AUTOMATION_WORKER_SECRET || "")
    .update(data)
    .digest("base64url");
}
export function swipeApplicationConsent(
  job: { id: string; applyUrl: string; employer: string },
  context: Context | null,
) {
  const identity = fillTarget(job.applyUrl);
  const platform = targetInfo(job.applyUrl)?.platform;
  if (
    !context ||
    !identity ||
    !platform ||
    !context.platforms.includes(platform)
  )
    return null;
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      workspaceId: workspaceId(),
      catalogId: job.id,
      identity,
      recipient: job.employer,
      ...context,
      expires: Date.now() + 15 * 60000,
    }),
  ).toString("base64url");
  return {
    token: payload + "." + signature(payload),
    cvName: context.cvName,
    submit: context.submit,
    recipient: job.employer,
  };
}
export async function verifySwipeApplicationConsent(
  token: string,
  job: { id: string; applyUrl: string; employer: string },
) {
  const fail = () => new AppError("application_consent_stale", 409);
  const [payload, sig, ...rest] = token.split(".");
  if (!payload || !sig || rest.length) throw fail();
  const expected = Buffer.from(signature(payload)),
    actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw fail();
  let value;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw fail();
  }
  if (
    typeof value.assetId !== "string" ||
    value.assetId.length > 150 ||
    typeof value.submit !== "boolean"
  )
    throw fail();
  const current = await swipeApplicationContext(
    value.selection === "job" ? value.assetId : undefined,
    value.submit,
  );
  if (
    !current ||
    value.version !== 1 ||
    value.workspaceId !== workspaceId() ||
    value.catalogId !== job.id ||
    value.identity !== fillTarget(job.applyUrl) ||
    value.recipient !== job.employer ||
    !Number.isFinite(value.expires) ||
    value.expires < Date.now() ||
    value.assetId !== current.assetId ||
    value.sha256 !== current.sha256 ||
    value.profileRevision !== current.profileRevision ||
    value.settingsRevision !== current.settingsRevision ||
    value.submit !== current.submit
  )
    throw fail();
  const catalog = await authDb.catalogJob.findUnique({ where: { id: job.id } });
  if (
    !catalog ||
    !(await resolvedApplicationReadiness(catalog, job.id)).automatic
  )
    throw new AppError("eligibility_confirmation_required", 409);
  return {
    version: 1,
    identity: value.identity,
    assetId: current.assetId,
    sha256: current.sha256,
    profileRevision: current.profileRevision,
    submit: current.submit,
    selection: current.selection,
    recipient: job.employer,
    approvedAt: new Date().toISOString(),
  };
}
export function automaticApplicationChoice(
  decision: { snapshot: unknown },
  rules: { resumeAssetId: string; submit: boolean },
) {
  const approval = (
    decision.snapshot as {
      applicationAuthorization?: {
        selection?: string;
        assetId?: string;
        submit?: boolean;
      };
    } | null
  )?.applicationAuthorization;
  return approval?.selection === "job" && typeof approval.assetId === "string"
    ? {
        resumeAssetId: approval.assetId,
        submit: rules.submit && approval.submit === true,
      }
    : { resumeAssetId: rules.resumeAssetId, submit: rules.submit };
}
export async function authorizedAutomaticApplication(
  decision: { applyUrl: string; snapshot: unknown },
  assetId: string,
  submit: boolean,
) {
  const approval = (
    decision.snapshot as {
      applicationAuthorization?: {
        version?: number;
        identity?: string;
        assetId?: string;
        sha256?: string;
        profileRevision?: number;
        submit?: boolean;
        approvedAt?: string;
      };
    }
  )?.applicationAuthorization;
  if (
    !approval ||
    approval.version !== 1 ||
    approval.identity !== fillTarget(decision.applyUrl) ||
    approval.assetId !== assetId ||
    (submit && !approval.submit) ||
    !approval.approvedAt
  )
    return false;
  const [profile, cv] = await Promise.all([
    getCandidate(),
    ownedCvSource(assetId),
  ]);
  return (
    approval.profileRevision === profile.revision &&
    approval.sha256 === cv.sha256
  );
}
