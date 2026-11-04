"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { requireDataset, requireWorkspace } from "@/server/authz";
import { action, AppError } from "@/server/errors";
import { nextRunFrom } from "@/server/monitoring";
import { normalizeName } from "@/lib/fields";

async function editor(workspaceId: string) {
  const user = await requireUser();
  await requireWorkspace(user.id, workspaceId, "EDITOR");
  return user;
}

const CompSchema = z.object({
  companyName: z.string().trim().max(200).optional(),
  roleTitle: z.string().trim().min(1).max(120),
  seniority: z.string().trim().min(1).max(60),
  city: z.string().max(80).nullable().optional(),
  country: z.string().max(80).nullable().optional(),
  year: z.number().int().min(2000).max(2100),
  currency: z.string().length(3).transform((s) => s.toUpperCase()),
  baseSalary: z.number().nonnegative().nullable().optional(),
  targetBonus: z.number().nonnegative().nullable().optional(),
  actualBonus: z.number().nonnegative().nullable().optional(),
  signingBonus: z.number().nonnegative().nullable().optional(),
  longTermIncentive: z.string().max(200).nullable().optional(),
  carriedInterest: z.string().max(200).nullable().optional(),
  sourceType: z.enum(["OFFICIAL", "EMPLOYEE_REPORTED", "MARKET_ESTIMATE", "USER_NETWORKING", "UNKNOWN"]),
  confidence: z.enum(["VERIFIED", "REPORTED", "ESTIMATED", "CONFLICTING", "UNKNOWN"]),
  sourceUrl: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isPrivate: z.boolean().default(false),
});

export async function addCompensation(workspaceId: string, input: unknown) {
  return action(async () => {
    await editor(workspaceId);
    const { companyName, ...d } = CompSchema.parse(input);
    if (d.sourceType === "OFFICIAL" && d.confidence === "VERIFIED" && !d.sourceUrl) throw new AppError("Official, verified figures need a source URL.", "INVALID");
    let companyId: string | null = null;
    if (companyName) {
      const n = normalizeName(companyName);
      companyId = (await db.company.upsert({ where: { workspaceId_normalizedName: { workspaceId, normalizedName: n } }, create: { workspaceId, name: companyName, normalizedName: n }, update: {} })).id;
    }
    // Insights from networking are private by default
    await db.compensationRecord.create({ data: { ...d, isPrivate: d.sourceType === "USER_NETWORKING" ? true : d.isPrivate, companyId, workspaceId } });
    revalidatePath(`/app/w/${workspaceId}/compensation`);
    return null;
  });
}

export async function deleteCompensation(workspaceId: string, id: string) {
  return action(async () => {
    await editor(workspaceId);
    await db.compensationRecord.deleteMany({ where: { id, workspaceId } });
    revalidatePath(`/app/w/${workspaceId}/compensation`);
    return null;
  });
}

const ScoringSchema = z.object({
  name: z.string().trim().min(1).max(80),
  datasetId: z.string(),
  criteria: z.array(z.object({
    fieldId: z.string(),
    weight: z.number().min(0).max(100),
    direction: z.enum(["HIGHER", "LOWER", "TRUE"]),
    constraintType: z.enum(["NONE", "MIN", "MAX", "EQUALS"]),
    constraintValue: z.string().max(100).nullable().optional(),
  })).min(1).max(20),
});

export async function saveScoringModel(workspaceId: string, modelId: string | null, input: unknown) {
  return action(async () => {
    await editor(workspaceId);
    const d = ScoringSchema.parse(input);
    await requireDataset(workspaceId, d.datasetId);
    const fields = await db.fieldDefinition.findMany({ where: { datasetId: d.datasetId, id: { in: d.criteria.map((c) => c.fieldId) } } });
    if (fields.length !== new Set(d.criteria.map((c) => c.fieldId)).size) throw new AppError("A criterion refers to an unknown field.", "INVALID");
    const total = d.criteria.reduce((a, c) => a + c.weight, 0);
    if (Math.abs(total - 100) > 0.5) throw new AppError(`Weights must add up to 100% (currently ${total}%).`, "INVALID");
    if (modelId) {
      const m = await db.scoringModel.findFirst({ where: { id: modelId, workspaceId } });
      if (!m) throw new AppError("Model not found.", "NOT_FOUND");
      await db.$transaction([
        db.scoringCriterion.deleteMany({ where: { modelId } }),
        db.scoringModel.update({ where: { id: modelId }, data: { name: d.name, datasetId: d.datasetId, criteria: { create: d.criteria } } }),
      ]);
      revalidatePath(`/app/w/${workspaceId}/ranking`);
      return { id: modelId };
    }
    const m = await db.scoringModel.create({ data: { workspaceId, name: d.name, datasetId: d.datasetId, criteria: { create: d.criteria } } });
    revalidatePath(`/app/w/${workspaceId}/ranking`);
    return { id: m.id };
  });
}

const RuleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  datasetId: z.string(),
  fieldIds: z.array(z.string()).min(1).max(20),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]),
  intervalDays: z.number().int().min(1).max(90).default(7),
  creditCapPerRun: z.number().int().min(5).max(2000),
});

export async function createMonitoringRule(workspaceId: string, input: unknown) {
  return action(async () => {
    const user = await editor(workspaceId);
    const d = RuleSchema.parse(input);
    await requireDataset(workspaceId, d.datasetId);
    const ok = await db.fieldDefinition.count({ where: { id: { in: d.fieldIds }, datasetId: d.datasetId } });
    if (ok !== d.fieldIds.length) throw new AppError("Unknown field in rule.", "INVALID");
    await db.monitoringRule.create({ data: { ...d, workspaceId, createdById: user.id, nextRunAt: nextRunFrom(new Date(), d.frequency, d.intervalDays) } });
    revalidatePath(`/app/w/${workspaceId}/monitoring`);
    return null;
  });
}

export async function updateMonitoringRule(workspaceId: string, id: string, input: { enabled?: boolean; runNow?: boolean }) {
  return action(async () => {
    await editor(workspaceId);
    const r = await db.monitoringRule.findFirst({ where: { id, workspaceId } });
    if (!r) throw new AppError("Rule not found.", "NOT_FOUND");
    await db.monitoringRule.update({ where: { id }, data: { ...(input.enabled !== undefined ? { enabled: input.enabled } : {}), ...(input.runNow ? { nextRunAt: new Date() } : {}) } });
    revalidatePath(`/app/w/${workspaceId}/monitoring`);
    return null;
  });
}

export async function deleteMonitoringRule(workspaceId: string, id: string) {
  return action(async () => {
    await editor(workspaceId);
    await db.monitoringRule.deleteMany({ where: { id, workspaceId } });
    revalidatePath(`/app/w/${workspaceId}/monitoring`);
    return null;
  });
}
