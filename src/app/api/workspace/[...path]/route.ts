import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorize } from "@/lib/authorization";
import { AppError } from "@/lib/contracts";
import { factsSchema, interview } from "@/lib/assistant-contracts";
import { aiConfiguration } from "@/lib/ai-provider";
import {
  approveDraft,
  editDraft,
  generateApplication,
  hash,
  json,
  prepare,
} from "@/lib/assistant";
import { createAttempt } from "@/lib/companion";
import { apiError, boundedBytes, readJson } from "@/lib/http";
import { extractCv } from "@/lib/cv";
import { documentBytes } from "@/lib/documents";
import { accountRequest } from "@/lib/account-request";
import { aiEnabled } from "@/lib/features";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    await authorize(req.headers, req.method);
    const [section, id, action] = (await ctx.params).path;
    const method = req.method;
    if (
      !aiEnabled() &&
      [
        "assistant",
        "facts",
        "resumes",
        "generations",
        "drafts",
        "attempts",
      ].includes(section)
    )
      throw new AppError("ai_deferred", 410);
    if (section === "facets" && method === "GET") {
      const fields = [
        "employmentType",
        "seniority",
        "workArrangement",
        "industry",
        "employer",
        "salaryCurrency",
        "salaryPeriod",
      ] as const;
      const entries = await Promise.all(
        fields.map(async (field) => [
          field,
          (
            await db.job.findMany({
              distinct: [field],
              select: { [field]: true },
              where: { hidden: false },
              take: 300,
            })
          )
            .map((row) => row[field])
            .filter(Boolean),
        ]),
      );
      return Response.json(Object.fromEntries(entries));
    }
    if (section === "assistant" && method === "GET") {
      const latest = await db.profileVersion.findFirst({
        orderBy: { createdAt: "desc" },
      });
      const facts = latest ? factsSchema.parse(latest.facts) : [];
      return Response.json({
        configuration: aiConfiguration(),
        profile: latest,
        interview: interview(facts),
        resumes: await db.resumeAsset.findMany({
          select: {
            id: true,
            name: true,
            sha256: true,
            isDefault: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
      });
    }
    if (section === "facts" && method === "PUT") {
      const { facts } = z
        .object({ facts: factsSchema })
        .strict()
        .parse(await readJson(req));
      return Response.json(
        await db.profileVersion.create({ data: { facts: json(facts) } }),
      );
    }
    if (section === "resumes") {
      if (method === "POST") {
        const raw = await boundedBytes(req, 4 * 1024 * 1024 + 10000);
        const form = await new Response(raw, {
          headers: { "Content-Type": req.headers.get("content-type") || "" },
        }).formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.size > 4 * 1024 * 1024)
          throw new AppError("cv_too_large", 413);
        const bytes = Buffer.from(await file.arrayBuffer());
        const text = await extractCv(bytes, file.name);
        const asset = await db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(640915)`;
          const first = (await tx.resumeAsset.count()) === 0;
          return tx.resumeAsset.create({
            data: {
              name: file.name.slice(0, 200),
              bytes,
              sha256: hash(bytes),
              text,
              isDefault: first,
            },
            select: { id: true, name: true, text: true, isDefault: true },
          });
        });
        return Response.json(asset);
      }
      if (method === "GET" && id) {
        const asset = await db.resumeAsset.findUniqueOrThrow({ where: { id } });
        if (action === "original")
          return new Response(asset.bytes, {
            headers: {
              "Content-Type": asset.name.toLowerCase().endsWith(".pdf")
                ? "application/pdf"
                : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "Content-Disposition": `attachment; filename="original-${asset.id}.${asset.name.toLowerCase().endsWith(".pdf") ? "pdf" : "docx"}"`,
            },
          });
        return Response.json({
          id: asset.id,
          name: asset.name,
          text: asset.text,
        });
      }
      if (method === "PATCH" && id) {
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(640915)`;
          await tx.resumeAsset.updateMany({ data: { isDefault: false } });
          await tx.resumeAsset.update({
            where: { id },
            data: { isDefault: true },
          });
        });
        return Response.json({ ok: true });
      }
    }
    if (section === "prepare" && id && method === "POST")
      return Response.json(await prepare(id));
    if (section === "generations") {
      if (method === "GET")
        await db.aiGeneration.updateMany({
          where: {
            state: "pending",
            createdAt: { lt: new Date(Date.now() - 120000) },
          },
          data: { state: "uncertain", error: "interrupted" },
        });
      if (method === "GET")
        return Response.json(
          await db.aiGeneration.findMany({
            where: {
              ...(req.nextUrl.searchParams.get("job")
                ? { jobId: req.nextUrl.searchParams.get("job")! }
                : {}),
            },
            include: {
              drafts: true,
              job: { select: { title: true, employer: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
        );
      if (method === "POST" && id) {
        const data = z
          .object({
            key: z.string().uuid(),
            questions: z
              .array(z.string().trim().min(1).max(500))
              .max(20)
              .default([]),
            language: z.literal("en").default("en"),
          })
          .strict()
          .parse(await readJson(req));
        return Response.json(
          await generateApplication(
            id,
            data.key,
            data.questions,
            data.language,
          ),
        );
      }
    }
    if (section === "drafts" && id) {
      if (method === "PATCH") {
        const data = z
          .object({
            content: z.string().min(1).max(80000),
            revision: z.number().int().positive(),
          })
          .strict()
          .parse(await readJson(req));
        await editDraft(id, data.content, data.revision);
        return Response.json({ ok: true });
      }
      if (method === "POST" && action === "approve") {
        const data = z
          .object({
            revision: z.number().int().positive(),
            confirm: z.literal(true),
          })
          .strict()
          .parse(await readJson(req));
        await approveDraft(id, data.revision);
        return Response.json({ ok: true });
      }
      if (method === "GET" && action === "download") {
        const draft = await db.documentDraft.findUniqueOrThrow({
          where: { id },
        });
        if (draft.approvedHash !== hash(draft.content))
          throw new AppError("approval_required", 409);
        const format =
          req.nextUrl.searchParams.get("format") === "docx" ? "docx" : "txt";
        return new Response(
          new Uint8Array(await documentBytes(draft.content, format)),
          {
            headers: {
              "Content-Type":
                format === "docx"
                  ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  : "text/plain; charset=utf-8",
              "Content-Disposition": `attachment; filename="${draft.kind}-v${draft.revision}.${format}"`,
            },
          },
        );
      }
    }
    if (section === "applications" && id && method === "GET")
      return Response.json(
        await db.application.findUniqueOrThrow({
          where: { id },
          include: {
            job: { include: { sources: true } },
            events: { orderBy: { createdAt: "desc" } },
            attempts: {
              select: {
                id: true,
                state: true,
                targetUrl: true,
                evidence: true,
                createdAt: true,
                expiresAt: true,
              },
              orderBy: { createdAt: "desc" },
            },
          },
        }),
      );
    if (
      section === "attempts" &&
      id &&
      action === "resolve" &&
      method === "POST"
    ) {
      const data = z
        .object({
          confirm: z.literal(true),
          resolution: z.enum(["not_sent", "sent", "unknown"]),
          notes: z.string().trim().min(10).max(3000),
        })
        .strict()
        .parse(await readJson(req));
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(640914)`;
        const attempt = await tx.applicationAttempt.findUniqueOrThrow({
          where: { id },
          include: { application: true },
        });
        if (
          ![
            "final_review",
            "submitting",
            "uncertain",
            "owner_reported_submitted",
          ].includes(attempt.state)
        )
          throw new AppError("attempt_resolution_not_needed", 409);
        const state =
          data.resolution === "not_sent"
            ? "cancelled_after_review"
            : data.resolution === "sent"
              ? "owner_reported_submitted"
              : "uncertain";
        await tx.applicationAttempt.update({
          where: { id },
          data: {
            state,
            revokedAt: new Date(),
            evidence: json({
              source: "owner_manual_review",
              resolution: data.resolution,
              notes: data.notes,
              previousEvidence: attempt.evidence,
            }),
          },
        });
        await tx.applicationEvent.create({
          data: {
            applicationId: attempt.applicationId,
            status: attempt.application.status,
            kind: "owner_review",
            message: `Owner reviewed attempt: ${data.resolution}. No automatic employer-status change.`,
            evidence: json({ notes: data.notes }),
          },
        });
      });
      return Response.json({ ok: true });
    }
    if (section === "attempts" && method === "POST") {
      const data = z
        .object({
          jobId: z.string(),
          generationId: z.string(),
          targetUrl: z.string().url(),
        })
        .strict()
        .parse(await readJson(req));
      return Response.json(
        await createAttempt(data.jobId, data.generationId, data.targetUrl),
      );
    }
    throw new AppError("not_found", 404);
  } catch (e) {
    return apiError(e);
  }
}
function scopedHandler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return accountRequest(req, () => handler(req, context));
}
export {
  scopedHandler as GET,
  scopedHandler as POST,
  scopedHandler as PUT,
  scopedHandler as PATCH,
};
