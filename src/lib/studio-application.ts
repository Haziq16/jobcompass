import { authDb, db } from "./db";
import { AppError, safeUrl } from "./contracts";
import { saveCatalogJob } from "./catalog";
import { prepare } from "./assistant";
import { workspaceId } from "./workspace-context";
async function linkedReview(ids: string[]) {
  return (
    (
      await db.aiReview.findFirst({
        where: {
          state: "succeeded",
          OR: ids.map((id) => ({ jobSnapshot: { path: ["id"], equals: id } })),
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      })
    )?.id || null
  );
}

export async function studioApplication(
  source: "catalog" | "workspace",
  id: string,
) {
  if (source === "catalog") {
    const job = await authDb.catalogJob.findUnique({
      where: { id },
      include: { board: true },
    });
    if (!job) throw new AppError("job_not_found", 404);
    const copy = await db.jobSource.findUnique({
      where: {
        workspaceId_providerId: {
          workspaceId: workspaceId(),
          providerId: job.providerId,
        },
      },
      include: { job: { include: { application: true } } },
    });
    const available =
      job.active &&
      job.board.enabled &&
      Boolean(
        job.board.lastSuccessAt &&
        job.board.lastSuccessAt.valueOf() > Date.now() - 48 * 3600_000,
      );
    return {
      reviewId: await linkedReview([id]),
      jobId: copy?.jobId || null,
      application: copy?.job.application || null,
      applyUrl: available ? safeUrl(job.applyUrl) : null,
      available,
    };
  }
  const job = await db.job.findUnique({
    where: { id },
    include: { sources: true, application: true },
  });
  if (!job) throw new AppError("job_not_found", 404);
  const links = job.sources
    .flatMap((s) =>
      Array.isArray(s.applyLinks)
        ? (s.applyLinks as { url?: string; direct?: boolean }[])
        : [],
    )
    .toSorted((a, b) => Number(Boolean(b.direct)) - Number(Boolean(a.direct)));
  const applyUrl =
    links.map((l) => safeUrl(l.url)).find(Boolean) ||
    job.sources.map((s) => safeUrl(s.primaryUrl)).find(Boolean) ||
    job.sources.map((s) => safeUrl(s.sourceUrl)).find(Boolean) ||
    null;
  const catalogIds = await authDb.catalogJob.findMany({
    where: { providerId: { in: job.sources.map((s) => s.providerId) } },
    select: { id: true },
  });
  return {
    reviewId: await linkedReview([id, ...catalogIds.map((j) => j.id)]),
    jobId: job.id,
    application: job.application,
    applyUrl,
    available: Boolean(applyUrl),
  };
}
export async function updateStudioApplication(
  source: "catalog" | "workspace",
  id: string,
  action: "prepare" | "confirm_submission",
) {
  const target = await studioApplication(source, id);
  if (action === "prepare" && !target.available)
    throw new AppError("listing_unavailable", 409);
  const jobId =
    target.jobId ||
    (source === "catalog" ? (await saveCatalogJob(id)).jobId : null);
  if (!jobId) throw new AppError("job_not_found", 404);
  const app = await prepare(jobId);
  if (action === "confirm_submission") {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(640914)`;
      const current = await tx.application.findUniqueOrThrow({
        where: { id: app.id },
      });
      if (current.status === "Applied") return;
      if (!["Saved", "Preparing"].includes(current.status))
        throw new AppError("application_state_changed", 409);
      await tx.application.update({
        where: { id: app.id },
        data: { status: "Applied", appliedAt: new Date() },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId: app.id,
          status: "Applied",
          kind: "manual",
          message:
            "Submission confirmed by the account holder after visiting the employer site.",
        },
      });
    });
  }
  return studioApplication(source, id);
}
