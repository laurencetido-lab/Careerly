"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { requireContact, requireWorkspace } from "@/server/authz";
import { action, AppError } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { normalizeName, isUrl, normalizeUrl } from "@/lib/fields";
import { scoreContact } from "@/lib/contactScore";
import { generateMessages } from "@/server/messages";

async function editor(workspaceId: string) {
  const user = await requireUser();
  const ws = await requireWorkspace(user.id, workspaceId, "EDITOR");
  return { user, ws };
}

const STAGES = ["DISCOVERED", "SHORTLISTED", "MESSAGE_DRAFTED", "CONTACTED", "RESPONDED", "CALL_SCHEDULED", "CALL_COMPLETED", "FOLLOW_UP", "REFERRAL"] as const;

const ContactSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  companyId: z.string().nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  team: z.string().max(120).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  profileUrl: z.string().max(500).nullable().optional().refine((u) => !u || isUrl(u), "Invalid profile URL"),
  alumniOf: z.string().max(200).nullable().optional(),
  isRecruiter: z.boolean().optional(),
  privateNotes: z.string().max(10000).nullable().optional(),
});

export async function createContact(workspaceId: string, input: unknown) {
  return action(async () => {
    const { ws } = await editor(workspaceId);
    const d = ContactSchema.parse(input);
    if (d.companyId && !(await db.company.findFirst({ where: { id: d.companyId, workspaceId } }))) throw new AppError("Employer not found.", "NOT_FOUND");
    const s = scoreContact(d, { roles: ws.targetRoles, locations: ws.targetLocations });
    const c = await db.contact.create({
      data: { ...d, profileUrl: d.profileUrl ? normalizeUrl(d.profileUrl) : null, workspaceId, origin: "MANUAL", stage: "SHORTLISTED", relevanceScore: s.score, recommendationReason: s.reasons.join(" · ") || null, dedupeKey: `${normalizeName(d.fullName)}|${d.companyId ?? "none"}|${Date.now()}` },
    });
    revalidatePath(`/app/w/${workspaceId}/networking`);
    return { id: c.id };
  });
}

export async function updateContact(workspaceId: string, contactId: string, input: unknown) {
  return action(async () => {
    const { ws } = await editor(workspaceId);
    const c = await requireContact(workspaceId, contactId);
    const d = ContactSchema.partial().extend({ stage: z.enum(STAGES).optional() }).parse(input);
    const merged = { ...c, ...d };
    const interactions = await db.networkingInteraction.count({ where: { contactId } });
    const s = scoreContact({ ...merged, hasInteractions: interactions > 0 }, { roles: ws.targetRoles, locations: ws.targetLocations });
    await db.contact.update({ where: { id: contactId }, data: { ...d, relevanceScore: s.score, recommendationReason: s.reasons.join(" · ") || c.recommendationReason } });
    revalidatePath(`/app/w/${workspaceId}/networking`);
    return null;
  });
}

export async function deleteContact(workspaceId: string, contactId: string) {
  return action(async () => {
    await editor(workspaceId);
    await requireContact(workspaceId, contactId);
    await db.contact.delete({ where: { id: contactId } });
    revalidatePath(`/app/w/${workspaceId}/networking`);
    return null;
  });
}

const InteractionSchema = z.object({
  type: z.enum(["MESSAGE", "EMAIL", "CALL", "MEETING", "NOTE", "REFERRAL"]),
  occurredAt: z.string().max(30).optional(),
  summary: z.string().max(10000).nullable().optional(),
  salaryInsight: z.string().max(2000).nullable().optional(),
  recruitmentInsight: z.string().max(2000).nullable().optional(),
  careerInsight: z.string().max(2000).nullable().optional(),
  nextAction: z.string().max(500).nullable().optional(),
  followUpAt: z.string().max(30).nullable().optional(),
  advanceStage: z.boolean().optional(),
});

const NEXT_STAGE: Record<string, (typeof STAGES)[number]> = { MESSAGE: "CONTACTED", EMAIL: "CONTACTED", CALL: "CALL_COMPLETED", MEETING: "CALL_COMPLETED", REFERRAL: "REFERRAL" };

export async function logInteraction(workspaceId: string, contactId: string, input: unknown) {
  return action(async () => {
    await editor(workspaceId);
    const c = await requireContact(workspaceId, contactId);
    const d = InteractionSchema.parse(input);
    await db.networkingInteraction.create({
      data: {
        workspaceId, contactId, type: d.type,
        occurredAt: d.occurredAt ? new Date(d.occurredAt) : new Date(),
        summary: d.summary, salaryInsight: d.salaryInsight, recruitmentInsight: d.recruitmentInsight, careerInsight: d.careerInsight,
        nextAction: d.nextAction, followUpAt: d.followUpAt ? new Date(d.followUpAt) : null,
      },
    });
    const next = NEXT_STAGE[d.type];
    if (d.advanceStage !== false && next && STAGES.indexOf(next) > STAGES.indexOf(c.stage)) await db.contact.update({ where: { id: contactId }, data: { stage: d.followUpAt ? "FOLLOW_UP" : next } });
    revalidatePath(`/app/w/${workspaceId}/networking/${contactId}`);
    return null;
  });
}

export async function completeFollowUp(workspaceId: string, interactionId: string) {
  return action(async () => {
    await editor(workspaceId);
    await db.networkingInteraction.updateMany({ where: { id: interactionId, workspaceId }, data: { followUpDone: true } });
    revalidatePath(`/app/w/${workspaceId}`);
    return null;
  });
}

const MsgSchema = z.object({
  purpose: z.enum(["CONNECTION_REQUEST", "AFTER_CONNECTION", "CALL_REQUEST", "INTRO_EMAIL", "FOLLOW_UP", "THANK_YOU", "REFERRAL_REQUEST", "EVENT_FOLLOW_UP", "POST_APPLICATION"]),
  platform: z.enum(["LINKEDIN", "EMAIL"]),
  language: z.string().min(2).max(5),
  context: z.string().max(1000).optional(),
});

export async function draftMessages(workspaceId: string, contactId: string, input: unknown) {
  return action(async () => {
    const { user, ws } = await editor(workspaceId);
    rateLimit(`msg:${user.id}`, 20, 60_000);
    await requireContact(workspaceId, contactId);
    const d = MsgSchema.parse(input);
    return generateMessages({ user, workspace: ws, contactId, ...d });
  });
}

export async function saveDraft(workspaceId: string, contactId: string, input: unknown) {
  return action(async () => {
    await editor(workspaceId);
    const c = await requireContact(workspaceId, contactId);
    const d = z.object({ purpose: z.string().max(40), platform: z.string().max(20), tone: z.string().max(30), language: z.string().max(5), body: z.string().trim().min(1).max(5000), generatedBy: z.enum(["AI", "TEMPLATE", "USER"]) }).parse(input);
    await db.messageDraft.create({ data: { ...d, workspaceId, contactId } });
    if (STAGES.indexOf(c.stage) < STAGES.indexOf("MESSAGE_DRAFTED")) await db.contact.update({ where: { id: contactId }, data: { stage: "MESSAGE_DRAFTED" } });
    revalidatePath(`/app/w/${workspaceId}/networking/${contactId}`);
    return null;
  });
}
