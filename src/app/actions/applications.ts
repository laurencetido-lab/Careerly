"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { action, AppError } from "@/server/errors";
import { slugKey } from "@/lib/fields";

async function editor(workspaceId: string) {
  const user = await requireUser();
  await requireWorkspace(user.id, workspaceId, "EDITOR");
  return user;
}
const optDate = z.string().max(30).nullable().optional().transform((s) => (s ? new Date(s) : null)).refine((d) => d === null || !Number.isNaN(d.getTime()), "Invalid date");

const AppSchema = z.object({
  companyId: z.string().nullable().optional(),
  opportunityId: z.string().nullable().optional(),
  recruiterId: z.string().nullable().optional(),
  role: z.string().trim().max(200),
  stage: z.string().max(40).optional(),
  applicationUrl: z.string().max(2000).nullable().optional(),
  appliedAt: optDate,
  deadline: optDate,
  cvVersion: z.string().max(200).nullable().optional(),
  coverLetter: z.string().max(20000).nullable().optional(),
  tests: z.string().max(5000).nullable().optional(),
  feedback: z.string().max(5000).nullable().optional(),
  compensationNote: z.string().max(1000).nullable().optional(),
  nextAction: z.string().max(500).nullable().optional(),
  nextActionAt: optDate,
});

async function checkRefs(workspaceId: string, d: { companyId?: string | null; opportunityId?: string | null; recruiterId?: string | null }) {
  if (d.companyId && !(await db.company.findFirst({ where: { id: d.companyId, workspaceId } }))) throw new AppError("Employer not found.", "NOT_FOUND");
  if (d.opportunityId && !(await db.opportunity.findFirst({ where: { id: d.opportunityId, workspaceId } }))) throw new AppError("Opportunity not found.", "NOT_FOUND");
  if (d.recruiterId && !(await db.contact.findFirst({ where: { id: d.recruiterId, workspaceId } }))) throw new AppError("Contact not found.", "NOT_FOUND");
}

export async function createApplication(workspaceId: string, input: unknown) {
  return action(async () => {
    await editor(workspaceId);
    const d = AppSchema.parse(input);
    await checkRefs(workspaceId, d);
    let role = d.role;
    let companyId = d.companyId ?? null;
    if (d.opportunityId) {
      const o = await db.opportunity.findUniqueOrThrow({ where: { id: d.opportunityId } });
      role ||= o.title;
      companyId ??= o.companyId;
      d.applicationUrl ??= o.applicationUrl;
      d.deadline ??= o.deadline;
    }
    const a = await db.application.create({ data: { ...d, role: role || "Role to define", companyId, workspaceId, stage: d.stage ?? "RESEARCHING" } });
    revalidatePath(`/app/w/${workspaceId}/applications`);
    return { id: a.id };
  });
}

export async function updateApplication(workspaceId: string, id: string, input: unknown) {
  return action(async () => {
    await editor(workspaceId);
    const a = await db.application.findFirst({ where: { id, workspaceId } });
    if (!a) throw new AppError("Application not found.", "NOT_FOUND");
    const d = AppSchema.partial().parse(input);
    await checkRefs(workspaceId, d);
    if (d.stage) {
      const ok = await db.pipelineStage.findUnique({ where: { workspaceId_key: { workspaceId, key: d.stage } } });
      if (!ok) throw new AppError("Unknown stage.", "INVALID");
    }
    await db.application.update({ where: { id }, data: d });
    revalidatePath(`/app/w/${workspaceId}/applications`);
    return null;
  });
}

export async function deleteApplication(workspaceId: string, id: string) {
  return action(async () => {
    await editor(workspaceId);
    await db.application.deleteMany({ where: { id, workspaceId } });
    revalidatePath(`/app/w/${workspaceId}/applications`);
    return null;
  });
}

export async function addStage(workspaceId: string, label: string) {
  return action(async () => {
    await editor(workspaceId);
    const l = z.string().trim().min(1).max(40).parse(label);
    const max = await db.pipelineStage.aggregate({ where: { workspaceId }, _max: { position: true } });
    const key = slugKey(l).toUpperCase();
    if (await db.pipelineStage.findUnique({ where: { workspaceId_key: { workspaceId, key } } })) throw new AppError("This stage already exists.", "CONFLICT");
    // Insert before terminal stages
    const terminal = await db.pipelineStage.findMany({ where: { workspaceId, terminal: true } });
    const pos = terminal.length ? Math.min(...terminal.map((t) => t.position)) : (max._max.position ?? 0) + 1;
    await db.pipelineStage.updateMany({ where: { workspaceId, position: { gte: pos } }, data: { position: { increment: 1 } } });
    await db.pipelineStage.create({ data: { workspaceId, key, label: l, position: pos } });
    revalidatePath(`/app/w/${workspaceId}/applications`);
    return null;
  });
}

const InterviewSchema = z.object({
  round: z.string().trim().min(1).max(100),
  scheduledAt: optDate,
  format: z.string().max(100).nullable().optional(),
  questions: z.string().max(20000).nullable().optional(),
  preparedAnswers: z.string().max(20000).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  feedback: z.string().max(5000).nullable().optional(),
  prepProgress: z.number().int().min(0).max(100).optional(),
});

export async function saveInterview(workspaceId: string, applicationId: string, interviewId: string | null, input: unknown) {
  return action(async () => {
    await editor(workspaceId);
    const a = await db.application.findFirst({ where: { id: applicationId, workspaceId } });
    if (!a) throw new AppError("Application not found.", "NOT_FOUND");
    const d = InterviewSchema.parse(input);
    if (interviewId) {
      const i = await db.interview.findFirst({ where: { id: interviewId, applicationId } });
      if (!i) throw new AppError("Interview not found.", "NOT_FOUND");
      await db.interview.update({ where: { id: interviewId }, data: d });
    } else await db.interview.create({ data: { ...d, applicationId } });
    revalidatePath(`/app/w/${workspaceId}/applications`);
    return null;
  });
}

export async function updateOpportunity(workspaceId: string, id: string, input: unknown) {
  return action(async () => {
    await editor(workspaceId);
    const o = await db.opportunity.findFirst({ where: { id, workspaceId } });
    if (!o) throw new AppError("Opportunity not found.", "NOT_FOUND");
    const d = z.object({ status: z.enum(["VERIFIED_OPEN", "PREVIOUSLY_OPEN_UNKNOWN", "CONFIRMED_CLOSED", "EXPECTED_UNCONFIRMED"]).optional(), deadline: optDate, relevance: z.string().max(500).nullable().optional() }).parse(input);
    await db.opportunity.update({ where: { id }, data: { ...d, ...(d.status === "VERIFIED_OPEN" ? { lastVerifiedAt: new Date() } : {}) } });
    revalidatePath(`/app/w/${workspaceId}/opportunities`);
    return null;
  });
}

const OppSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  location: z.string().max(120).nullable().optional(),
  pipeline: z.enum(["GRADUATE_PROGRAMME", "INTERNSHIP", "PERMANENT", "OTHER"]),
  employmentType: z.string().max(80).nullable().optional(),
  deadline: optDate,
  applicationUrl: z.string().max(2000).nullable().optional(),
  salaryText: z.string().max(200).nullable().optional(),
  conversionEvidence: z.string().max(2000).nullable().optional(),
});

export async function createOpportunity(workspaceId: string, input: unknown) {
  return action(async () => {
    await editor(workspaceId);
    const d = OppSchema.parse(input);
    const { normalizeName } = await import("@/lib/fields");
    const norm = normalizeName(d.companyName);
    const company = await db.company.upsert({ where: { workspaceId_normalizedName: { workspaceId, normalizedName: norm } }, create: { workspaceId, name: d.companyName, normalizedName: norm }, update: {} });
    const dedupeKey = `${company.id}|${normalizeName(d.title)}|${normalizeName(d.location ?? "")}`;
    const { companyName: _c, ...rest } = d;
    void _c;
    const o = await db.opportunity.upsert({
      where: { workspaceId_dedupeKey: { workspaceId, dedupeKey } },
      create: { ...rest, workspaceId, companyId: company.id, dedupeKey, origin: "MANUAL", status: "PREVIOUSLY_OPEN_UNKNOWN" },
      update: rest,
    });
    revalidatePath(`/app/w/${workspaceId}/opportunities`);
    return { id: o.id };
  });
}
