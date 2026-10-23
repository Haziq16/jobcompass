import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { workspaceId } from "./workspace-context";
import { AppError } from "./contracts";
import { ownedCvSource, saveCvSource } from "./cv-source";
import { extractCv } from "./cv";
import { cvSkillSignals } from "./resume-checks";
import {
  candidateValuesSchema,
  candidateSaveSchema,
  candidateSections,
  emptyCandidate,
  sectionLabels,
  answerSaveSchema,
  questionSchema,
  classifyQuestion,
  normalizeQuestion,
  normalizeCountry,
  normalizeCompany,
  mentionedCountry,
  countryCategories,
  sourceSections,
  type CandidateValues,
  type CandidateSection,
  type AnswerCategory,
} from "./application-memory-contracts";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
type Confirmations = Partial<
  Record<CandidateSection, { hash: string; at: string }>
>;
type Context = {
  country: string | null;
  company: string | null;
  catalogId: string | null;
};
export type CandidateResult = Awaited<ReturnType<typeof getCandidate>>;
export function sectionHash(v: CandidateValues, s: CandidateSection) {
  return hash({
    values: v[s],
    nothing: v.nothingToDeclare.includes(s as "skills"),
  });
}
function validSection(v: CandidateValues, s: CandidateSection) {
  if (s === "contact") return Boolean(v.contact.name && v.contact.email);
  if (
    ["experience", "education", "projects", "skills"].includes(s) &&
    v.nothingToDeclare.includes(s as "skills")
  )
    return (v[s] as unknown[]).length === 0;
  if (s === "experience")
    return (
      v.experience.length > 0 &&
      v.experience.every((r) => r.employer && r.title && r.start)
    );
  if (s === "education")
    return (
      v.education.length > 0 &&
      v.education.every((r) => r.institution && r.qualification)
    );
  if (s === "projects")
    return (
      v.projects.length > 0 && v.projects.every((r) => r.name && r.summary)
    );
  if (s === "skills") return v.skills.length > 0;
  if (s === "eligibility")
    return (
      v.eligibility.length > 0 &&
      v.eligibility.every(
        (r) => r.status !== "unknown" && r.needsSponsorship !== "unknown",
      )
    );
  return Boolean(
    v.preferences.availability ||
    v.preferences.noticePeriod ||
    v.preferences.salaryAnswer,
  );
}
async function lock(tx: Pick<Prisma.TransactionClient, "$executeRaw">) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"application-memory:" + workspaceId()},0))`;
}
export async function getCandidate() {
  const [record, sources, legacy] = await Promise.all([
    db.candidateProfile.findUnique({ where: { workspaceId: workspaceId() } }),
    db.resumeAsset.findMany({
      select: { id: true, name: true, isDefault: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      take: 20,
    }),
    db.profile.findUnique({ where: { id: "owner" }, select: { cvText: true } }),
  ]);
  const values = record
    ? candidateValuesSchema.parse(record.values)
    : emptyCandidate;
  const confirmations = (record?.confirmations || {}) as Confirmations;
  return {
    values,
    revision: record?.revision || 0,
    confirmations,
    sources,
    hasSavedCv: Boolean(sources.length || legacy?.cvText),
    sections: candidateSections.map((section) => ({
      section,
      label: sectionLabels[section],
      confirmed: confirmations[section]?.hash === sectionHash(values, section),
      at: confirmations[section]?.at || null,
    })),
  };
}
export async function saveCandidate(input: unknown) {
  const data = candidateSaveSchema.parse(input);
  if (
    new Set(data.values.eligibility.map((r) => normalizeCountry(r.country)))
      .size !== data.values.eligibility.length
  )
    throw new AppError("duplicate_country", 400);
  if (data.values.cvSource)
    await ownedCvSource(
      data.values.cvSource.assetId,
      undefined,
      data.values.cvSource.sha256,
    );
  for (const s of data.confirmSections)
    if (!validSection(data.values, s))
      throw new AppError("profile_section_incomplete", 400);
  return db.$transaction(async (tx) => {
    await lock(tx);
    const old = await tx.candidateProfile.findUnique({
      where: { workspaceId: workspaceId() },
    });
    if ((old?.revision || 0) !== data.expectedRevision)
      throw new AppError("revision_conflict", 409);
    const confirmations = (old?.confirmations || {}) as Confirmations;
    const next: Confirmations = {};
    for (const section of candidateSections) {
      const h = sectionHash(data.values, section);
      if (data.confirmSections.includes(section))
        next[section] = { hash: h, at: new Date().toISOString() };
      else if (confirmations[section]?.hash === h)
        next[section] = confirmations[section];
    }
    return tx.candidateProfile.upsert({
      where: { workspaceId: workspaceId() },
      create: {
        workspaceId: workspaceId(),
        values: json(data.values),
        confirmations: json(next),
      },
      update: {
        values: json(data.values),
        confirmations: json(next),
        revision: { increment: 1 },
      },
    });
  });
}
export function cvSuggestions(
  text: string,
  source: { assetId: string; sha256: string } | null = null,
) {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone =
    lines
      .flatMap((l) => l.match(/\+?\d[\d ()-]{8,}\d/g) || [])
      .find(
        (s) =>
          s.replace(/\D/g, "").length >= 10 &&
          s.replace(/\D/g, "").length <= 15,
      ) || "";
  const urls = text.match(/https?:\/\/[^\s<>]+/g) || [];
  const blocks: { section: CandidateSection; text: string }[] = [];
  let section: CandidateSection | null = null,
    buffer: string[] = [];
  function flush() {
    if (section && buffer.length)
      blocks.push({ section, text: buffer.join("\n").slice(0, 4000) });
    buffer = [];
  }
  for (const line of lines) {
    const heading = line.toLowerCase().replace(/[:\s]+$/g, "");
    const next =
      /^(work experience|professional experience|employment|experience)$/.test(
        heading,
      )
        ? "experience"
        : /^(education|academic background|qualifications)$/.test(heading)
          ? "education"
          : /^(projects|selected projects|personal projects)$/.test(heading)
            ? "projects"
            : /^(skills|technical skills|technologies)$/.test(heading)
              ? "skills"
              : null;
    if (next) {
      flush();
      section = next;
    } else if (section) buffer.push(line);
  }
  flush();
  const name =
    lines[0] && lines[0].length < 90 && !/@|https?:|\d{3}/.test(lines[0])
      ? lines[0]
      : "";
  return {
    contact: {
      name,
      firstName: "",
      lastName: "",
      email,
      phone,
      location: "",
      linkedin: urls.find((u) => /linkedin\.com\//i.test(u)) || "",
      portfolio: urls.find((u) => !/linkedin\.com\//i.test(u)) || "",
    },
    skills: cvSkillSignals(text).slice(0, 80),
    blocks: blocks.slice(0, 12),
    cvSource: source,
    extractedText: text.slice(0, 40000),
    warning:
      "Suggestions are unconfirmed. Check every value against the original CV; dates and eligibility are never inferred.",
  };
}
export async function importCandidateCv(
  file?: { bytes: Buffer; name: string },
  assetId?: string,
) {
  if (file) {
    if (file.bytes.length > 5 * 1024 * 1024)
      throw new AppError("cv_too_large", 400);
    if (file.name.toLowerCase().endsWith(".docx")) {
      const source = await saveCvSource(file.bytes, file.name, false);
      return cvSuggestions(source.text, {
        assetId: source.sourceDocument.id,
        sha256: source.sourceDocument.sha256,
      });
    }
    const text = await extractCv(file.bytes, file.name);
    const sha256 = createHash("sha256").update(file.bytes).digest("hex");
    let asset = await db.resumeAsset.findFirst({
      where: { sha256 },
      select: { id: true },
    });
    if (!asset)
      asset = await db.resumeAsset.create({
        data: {
          name: file.name.slice(0, 200),
          bytes: new Uint8Array(file.bytes),
          text,
          sha256,
          isDefault: false,
        },
        select: { id: true },
      });
    return cvSuggestions(text, { assetId: asset.id, sha256 });
  }
  const asset = assetId
    ? await db.resumeAsset.findUnique({
        where: { id: assetId },
        select: { id: true, text: true, sha256: true },
      })
    : await db.resumeAsset.findFirst({
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        select: { id: true, text: true, sha256: true },
      });
  if (asset)
    return cvSuggestions(asset.text, {
      assetId: asset.id,
      sha256: asset.sha256,
    });
  if (assetId) throw new AppError("not_found", 404);
  const profile = await db.profile.findUnique({
    where: { id: "owner" },
    select: { cvText: true },
  });
  if (!profile?.cvText) throw new AppError("cv_source_missing", 404);
  return cvSuggestions(profile.cvText);
}
async function contextFor(
  raw: { country: string; company: string; catalogId: string | null },
  question: string,
): Promise<Context> {
  const detected = mentionedCountry(question);
  let country = normalizeCountry(raw.country) || detected;
  if (detected && country && detected !== country)
    throw new AppError("question_country_mismatch", 400);
  let company = normalizeCompany(raw.company) || null;
  if (raw.catalogId) {
    const decision = await db.matchDecision.findUnique({
      where: {
        workspaceId_catalogId: {
          workspaceId: workspaceId(),
          catalogId: raw.catalogId,
        },
      },
    });
    // Preparation can precede a queue decision. Only this account's completed
    // catalogue review can establish that job context without creating a swipe.
    const review = !decision
      ? await db.aiReview.findFirst({
          where: {
            state: "succeeded",
            AND: [
              { jobSnapshot: { path: ["id"], equals: raw.catalogId } },
              { jobSnapshot: { path: ["source"], equals: "catalog" } },
            ],
          },
          orderBy: { createdAt: "desc" },
        })
      : null;
    const snapshot = decision?.snapshot || review?.jobSnapshot;
    if (!snapshot) throw new AppError("not_found", 404);
    const employer = (snapshot as { employer: string }).employer;
    if (company && company !== normalizeCompany(employer))
      throw new AppError("question_company_mismatch", 400);
    company = normalizeCompany(employer);
  }
  country = country || null;
  return { country, company, catalogId: raw.catalogId };
}
const expiryDays = (category: AnswerCategory) =>
  category === "availability"
    ? 7
    : category === "salary"
      ? 30
      : category === "authorization" || category === "sponsorship"
        ? 90
        : null;
function answerHealth(
  answer: {
    expiresAt: Date | null;
    category: string;
    sourceHash: string | null;
    country?: string | null;
  },
  profile: CandidateValues | null,
) {
  if (answer.expiresAt && answer.expiresAt <= new Date()) return "expired";
  const section = sourceSections[answer.category as AnswerCategory];
  if (
    section === "eligibility" &&
    answer.country &&
    answer.sourceHash?.startsWith("country-v1:")
  ) {
    return profile &&
      answer.sourceHash ===
        "country-v1:" +
          hash(
            profile.eligibility.filter(
              (r) => normalizeCountry(r.country) === answer.country,
            ),
          )
      ? "current"
      : "profile_changed";
  }
  if (
    section &&
    (profile ? sectionHash(profile, section) : null) !== answer.sourceHash
  )
    return "profile_changed";
  return "current";
}
function scopeMatches(answer: Context, context: Context) {
  return (
    (!answer.country || answer.country === context.country) &&
    (!answer.company || answer.company === context.company) &&
    (!answer.catalogId || answer.catalogId === context.catalogId)
  );
}
export async function saveApplicationAnswer(input: unknown) {
  const data = answerSaveSchema.parse(input);
  const classified = classifyQuestion(data.question);
  const category =
    classified.category === "custom" ? data.category : classified.category;
  const context = await contextFor(data.context, data.question);
  if (!data.reusable && !context.catalogId)
    throw new AppError("answer_job_required", 400);
  if (countryCategories.has(category) && !context.country)
    throw new AppError("answer_country_required", 400);
  if (category === "motivation" && !context.company && !context.catalogId)
    throw new AppError("answer_company_required", 400);
  if (data.reusable && data.reuseScope === "country" && !context.country)
    throw new AppError("answer_country_required", 400);
  if (
    data.reusable &&
    data.reuseScope === "general" &&
    (countryCategories.has(category) || category === "motivation")
  )
    throw new AppError("answer_context_required", 400);
  const storedContext =
    data.reusable && data.reuseScope === "country"
      ? { ...context, company: null, catalogId: null }
      : data.reusable && data.reuseScope === "general"
        ? { country: null, company: null, catalogId: null }
        : context;
  for (const alias of data.aliases) {
    const other = classifyQuestion(alias);
    if (
      other.category !== "custom" &&
      (other.category !== category ||
        (classified.category !== "custom" && other.key !== classified.key))
    )
      throw new AppError("answer_alias_conflict", 400);
    const country = mentionedCountry(alias);
    if (country && context.country !== country)
      throw new AppError("question_country_mismatch", 400);
  }
  const days = expiryDays(category);
  const now = new Date();
  const automatic = days ? new Date(now.valueOf() + days * 86400000) : null;
  let expiresAt = data.expiresAt ? new Date(data.expiresAt) : automatic;
  if (expiresAt && expiresAt <= now)
    throw new AppError("answer_expiry_in_past", 400);
  if (automatic && expiresAt && expiresAt > automatic) expiresAt = automatic;
  return db.$transaction(async (tx) => {
    await lock(tx);
    const old = data.id
      ? await tx.applicationAnswer.findUnique({ where: { id: data.id } })
      : null;
    if (data.id && !old) throw new AppError("not_found", 404);
    if ((old?.revision || 0) !== data.expectedRevision)
      throw new AppError("revision_conflict", 409);
    const duplicate = await tx.applicationAnswer.findFirst({
      where: {
        canonicalKey: classified.key,
        country: storedContext.country,
        company: storedContext.company,
        catalogId: storedContext.catalogId,
        ...(old ? { id: { not: old.id } } : {}),
      },
    });
    if (duplicate) throw new AppError("answer_already_saved", 409);
    const profile = await tx.candidateProfile.findUnique({
      where: { workspaceId: workspaceId() },
    });
    const section = sourceSections[category];
    const sourceHash =
      section && profile
        ? section === "eligibility" && storedContext.country
          ? "country-v1:" +
            hash(
              candidateValuesSchema
                .parse(profile.values)
                .eligibility.filter(
                  (r) => normalizeCountry(r.country) === storedContext.country,
                ),
            )
          : sectionHash(candidateValuesSchema.parse(profile.values), section)
        : null;
    const values = {
      question: data.question,
      canonicalKey: classified.key,
      aliases: [
        ...new Set([
          normalizeQuestion(data.question),
          ...data.aliases.map(normalizeQuestion),
        ]),
      ],
      category,
      answer: data.answer,
      ...storedContext,
      reusable: data.reusable,
      sourceHash,
      expiresAt,
      verifiedAt: now,
    };
    const saved = old
      ? await tx.applicationAnswer.update({
          where: { id: old.id },
          data: { ...values, revision: { increment: 1 } },
        })
      : await tx.applicationAnswer.create({
          data: { workspaceId: workspaceId(), ...values },
        });
    if (data.questionId) {
      const question = await tx.applicationQuestion.findUnique({
        where: { id: data.questionId },
      });
      if (!question) throw new AppError("not_found", 404);
      if (
        !scopeMatches(context, {
          country: question.country || context.country,
          company: question.company,
          catalogId: question.catalogId,
        })
      )
        throw new AppError("answer_context_mismatch", 409);
      if (
        !saved.aliases.includes(normalizeQuestion(question.question)) &&
        classifyQuestion(question.question).key !== saved.canonicalKey
      )
        throw new AppError("answer_question_mismatch", 409);
      await tx.applicationQuestion.update({
        where: { id: question.id },
        data: {
          state: "answered",
          answerId: saved.id,
          ...(!question.country && context.country
            ? { country: context.country }
            : {}),
          revision: { increment: 1 },
        },
      });
    }
    return saved;
  });
}
function candidateAnswer(
  key: string,
  context: Context,
  profile: { values: Prisma.JsonValue; confirmations: Prisma.JsonValue } | null,
) {
  if (!profile) return null;
  const values = candidateValuesSchema.parse(profile.values);
  const confirmations = profile.confirmations as Confirmations;
  const category =
    key.split(".")[0] === "authorization"
      ? "authorization"
      : (key.split(".")[0] as AnswerCategory);
  const section = sourceSections[category];
  if (!section || confirmations[section]?.hash !== sectionHash(values, section))
    return null;
  const days = expiryDays(category);
  if (
    days &&
    Date.now() - new Date(confirmations[section]!.at).valueOf() >=
      days * 86400000
  )
    return null;
  let answer: string | null = null;
  if (key === "contact.name") answer = values.contact.name;
  if (key === "contact.email") answer = values.contact.email;
  if (key === "contact.phone") answer = values.contact.phone;
  if (key === "availability.start") answer = values.preferences.availability;
  if (key === "availability.notice") answer = values.preferences.noticePeriod;
  if (
    key === "salary.expected" &&
    normalizeCountry(values.preferences.salaryCountry) === context.country
  )
    answer = values.preferences.salaryAnswer;
  if (
    key === "relocation.willing" &&
    values.preferences.relocation !== "unknown"
  )
    answer = values.preferences.relocation === "yes" ? "Yes" : "No";
  if (
    (key === "authorization.work" || key === "sponsorship.required") &&
    context.country
  ) {
    const row = values.eligibility.find(
      (r) => normalizeCountry(r.country) === context.country,
    );
    if (
      row &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(row.expiresOn) ||
        new Date(row.expiresOn + "T23:59:59Z") > new Date())
    ) {
      if (key === "authorization.work" && row.status !== "unknown")
        answer = row.status === "not_authorized" ? "No" : "Yes";
      if (key === "sponsorship.required" && row.needsSponsorship !== "unknown")
        answer = row.needsSponsorship === "yes" ? "Yes" : "No";
    }
  }
  return answer
    ? {
        answer,
        source: "Confirmed application profile",
        answerId: null,
        verifiedAt: confirmations[section]!.at,
      }
    : null;
}
async function resolve(
  question: string,
  context: Context,
  boundAnswerId?: string | null,
) {
  const classified = classifyQuestion(question);
  if (countryCategories.has(classified.category) && !context.country)
    return {
      status: "context_required",
      message: "Choose the country this question refers to.",
      answer: null,
    };
  const [rows, profile] = await Promise.all([
    db.applicationAnswer.findMany({
      where: {
        OR: [
          { canonicalKey: classified.key },
          { aliases: { has: normalizeQuestion(question) } },
        ],
      },
      orderBy: { verifiedAt: "desc" },
      take: 100,
    }),
    db.candidateProfile.findUnique({ where: { workspaceId: workspaceId() } }),
  ]);
  const values = profile ? candidateValuesSchema.parse(profile.values) : null;
  const eligible = rows.filter(
    (a) =>
      (a.reusable ||
        (a.catalogId && a.catalogId === context.catalogId) ||
        a.id === boundAnswerId) &&
      scopeMatches(a, context),
  );
  const current = eligible.filter((a) => answerHealth(a, values) === "current");
  const score = (a: Context) =>
    Number(Boolean(a.country)) * 2 +
    Number(Boolean(a.company)) * 4 +
    Number(Boolean(a.catalogId)) * 8;
  const best = Math.max(-1, ...current.map(score));
  const top = current.filter((a) => score(a) === best);
  const fact = candidateAnswer(classified.key, context, profile);
  if (
    new Set(top.map((a) => a.answer.trim())).size > 1 ||
    (fact &&
      best <= 2 &&
      top.length &&
      top[0].answer.trim() !== fact.answer.trim())
  )
    return {
      status: "conflict",
      message: "Saved answers disagree. Resolve the conflict before reuse.",
      answer: null,
    };
  if (top.length)
    return {
      status: "answered",
      message: "A current, confirmed answer matches this context.",
      answer: {
        answer: top[0].answer,
        source: "Saved answer memory",
        answerId: top[0].id,
        verifiedAt: top[0].verifiedAt,
      },
    };
  if (eligible.length)
    return {
      status: "needs_review",
      message:
        "The answer expired or its profile facts changed. Confirm it again before reuse.",
      answer: null,
    };
  if (fact)
    return {
      status: "answered",
      message: "Using a confirmed profile fact.",
      answer: fact,
    };
  return {
    status: "missing",
    message: "No confirmed answer for this question and context.",
    answer: null,
  };
}
export async function lookupApplicationAnswer(input: unknown) {
  const data = questionSchema.parse(input);
  const context = await contextFor(data.context, data.question);
  const fingerprint = hash({
    question: normalizeQuestion(data.question),
    ...context,
  });
  const previous = await db.applicationQuestion.findUnique({
    where: {
      workspaceId_fingerprint: { workspaceId: workspaceId(), fingerprint },
    },
  });
  const result = await resolve(data.question, context, previous?.answerId);
  let questionId = previous?.id || null;
  if (data.createMissing && result.status !== "answered") {
    const row = await db.applicationQuestion.upsert({
      where: {
        workspaceId_fingerprint: { workspaceId: workspaceId(), fingerprint },
      },
      create: {
        workspaceId: workspaceId(),
        fingerprint,
        question: data.question,
        ...context,
      },
      update:
        previous?.state === "dismissed"
          ? { state: "open", revision: { increment: 1 } }
          : {},
    });
    questionId = row.id;
  }
  return { ...result, questionId, context };
}
export async function applicationMemory(page = 1, catalogId?: string) {
  const [answers, questions, totalAnswers, totalQuestions, profile] =
    await Promise.all([
      db.applicationAnswer.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 30,
        skip: (page - 1) * 30,
      }),
      db.applicationQuestion.findMany({
        where: catalogId ? { catalogId } : {},
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 30,
        skip: (page - 1) * 30,
      }),
      db.applicationAnswer.count(),
      db.applicationQuestion.count({ where: catalogId ? { catalogId } : {} }),
      db.candidateProfile.findUnique({ where: { workspaceId: workspaceId() } }),
    ]);
  const values = profile ? candidateValuesSchema.parse(profile.values) : null;
  const candidate = await getCandidate();
  return {
    answers: answers.map((a) => ({ ...a, health: answerHealth(a, values) })),
    questions: await Promise.all(
      questions.map(async (q) => ({
        ...q,
        sourceDraft:
          candidate.sections.some(
            (s) => s.section === "projects" && s.confirmed,
          ) &&
          /\b(project|built|artifact|repository)\b/i.test(q.question) &&
          candidate.values.projects[0]?.summary
            ? {
                text: [
                  candidate.values.projects[0].name,
                  candidate.values.projects[0].summary,
                  candidate.values.projects[0].url,
                ]
                  .filter(Boolean)
                  .join("\n\n"),
                source:
                  "Your confirmed project passage. Review and adapt it to answer this question; it is not a generated claim.",
              }
            : null,
        resolution:
          q.state === "dismissed"
            ? {
                status: "dismissed",
                message: "Dismissed by you.",
                answer: null,
              }
            : await resolve(q.question, q, q.answerId),
      })),
    ),
    totalAnswers,
    totalQuestions,
    page,
  };
}
export async function deleteApplicationAnswer(id: string, revision: number) {
  return db.$transaction(async (tx) => {
    await lock(tx);
    const result = await tx.applicationAnswer.deleteMany({
      where: { id, revision },
    });
    if (!result.count) throw new AppError("revision_conflict", 409);
    await tx.applicationQuestion.updateMany({
      where: { answerId: id },
      data: { answerId: null, state: "open", revision: { increment: 1 } },
    });
    return { deleted: true };
  });
}
export async function dismissApplicationQuestion(id: string, revision: number) {
  const result = await db.applicationQuestion.updateMany({
    where: { id, revision },
    data: { state: "dismissed", revision: { increment: 1 } },
  });
  if (!result.count) throw new AppError("revision_conflict", 409);
  return { dismissed: true };
}

export async function getApplicationAnswer(id: string) {
  const answer = await db.applicationAnswer.findFirst({ where: { id } });
  if (!answer) throw new AppError("not_found", 404);
  const profile = await getCandidate();
  return { ...answer, health: answerHealth(answer, profile.values) };
}
