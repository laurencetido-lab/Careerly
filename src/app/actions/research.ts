"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { requireDataset, requireWorkspace } from "@/server/authz";
import { action, AppError } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { creditSummary, estimateDiscoveryCredits, estimateEnrichCredits, estimateVerifyCredits } from "@/server/credits";
import { createDiscoveryPlan, createEnrichPlan, createVerifyPlan } from "@/server/research/plan";
import { cancelJob, launchPlan, researchReadiness } from "@/server/research/jobs";

export type PlanView = {
  id: string;
  scope: string;
  objective: string;
  generatedBy: string;
  estimatedCredits: number;
  rows: number;
  maxResults: number;
  items: { id: string; fieldName: string | null; instruction: string; queries: string[] }[];
  readiness: string | null;
  credits: { allowance: number; used: number; reserved: number; available: number };
};

async function planView(planId: string, userId: string): Promise<PlanView> {
  const plan = await db.researchPlan.findFirstOrThrow({ where: { id: planId, createdById: userId }, include: { items: { include: { field: true }, orderBy: { position: "asc" } } } });
  const rows = plan.scope.startsWith("DISCOVER") || plan.scope === "VERIFY_COMPANIES" ? 0 : plan.rowIds.length || (plan.datasetId ? await db.datasetRow.count({ where: { datasetId: plan.datasetId } }) : 0);
  return {
    id: plan.id,
    scope: plan.scope,
    objective: plan.objective,
    generatedBy: plan.generatedBy,
    estimatedCredits: plan.estimatedCredits,
    rows,
    maxResults: plan.maxResults,
    items: plan.items.map((i) => ({ id: i.id, fieldName: i.field?.name ?? null, instruction: i.instruction, queries: i.queries })),
    readiness: researchReadiness(plan.scope),
    credits: await creditSummary(userId),
  };
}

const EnrichSchema = z.object({
  datasetId: z.string(),
  fieldIds: z.array(z.string()).min(1).max(30),
  rowIds: z.array(z.string()).max(5000).default([]),
  scope: z.enum(["CELL", "ROW", "ROWS", "COLUMN", "DATASET"]),
});

export async function planEnrichment(workspaceId: string, input: unknown) {
  return action(async () => {
    const user = await requireUser();
    const ws = await requireWorkspace(user.id, workspaceId, "EDITOR");
    rateLimit(`plan:${user.id}`, 30, 60_000);
    const d = EnrichSchema.parse(input);
    await requireDataset(workspaceId, d.datasetId);
    const fields = await db.fieldDefinition.findMany({ where: { id: { in: d.fieldIds }, datasetId: d.datasetId, type: { notIn: ["FORMULA"] }, isPrimary: false } });
    if (!fields.length) throw new AppError("Choose fields to research (the name and formula columns cannot be researched).", "INVALID");
    const rowIds = d.rowIds.length ? (await db.datasetRow.findMany({ where: { id: { in: d.rowIds }, datasetId: d.datasetId }, select: { id: true } })).map((r) => r.id) : [];
    const totalRows = await db.datasetRow.count({ where: { datasetId: d.datasetId } });
    if (!totalRows) throw new AppError("This table has no rows yet.", "INVALID");
    const plan = await createEnrichPlan(user, ws, { datasetId: d.datasetId, fields, rowIds, scope: d.scope, totalRows });
    return planView(plan.id, user.id);
  });
}

const DiscoverSchema = z.object({
  scope: z.enum(["DISCOVER_COMPANIES", "DISCOVER_CONTACTS", "DISCOVER_OPPORTUNITIES"]),
  objective: z.string().trim().max(2000),
  datasetId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  maxResults: z.number().int().min(1).max(100).default(20),
  roles: z.array(z.string().max(80)).max(8).optional(),
});

export async function planDiscovery(workspaceId: string, input: unknown) {
  return action(async () => {
    const user = await requireUser();
    const ws = await requireWorkspace(user.id, workspaceId, "EDITOR");
    rateLimit(`plan:${user.id}`, 30, 60_000);
    const d = DiscoverSchema.parse(input);
    if (d.datasetId) await requireDataset(workspaceId, d.datasetId);
    if (d.scope !== "DISCOVER_COMPANIES" && !d.companyId) throw new AppError("Choose an employer.", "INVALID");
    const plan = await createDiscoveryPlan(user, ws, { ...d, objective: d.objective || ws.objective, datasetId: d.datasetId ?? null, companyId: d.companyId ?? null });
    return planView(plan.id, user.id);
  });
}

export async function planVerification(workspaceId: string, input: unknown) {
  return action(async () => {
    const user = await requireUser();
    const ws = await requireWorkspace(user.id, workspaceId, "EDITOR");
    rateLimit(`plan:${user.id}`, 30, 60_000);
    const d = z.object({ datasetId: z.string(), rowIds: z.array(z.string()).max(5000).default([]) }).parse(input);
    await requireDataset(workspaceId, d.datasetId);
    const plan = await createVerifyPlan(user, ws, d);
    return planView(plan.id, user.id);
  });
}

const ItemsSchema = z.array(z.object({ id: z.string(), instruction: z.string().trim().min(3).max(2000), queries: z.array(z.string().trim().min(2).max(300)).min(1).max(5) })).max(40);

/** Save user edits to a draft plan and recompute its estimate. */
export async function updatePlan(workspaceId: string, planId: string, itemsInput: unknown, maxResults?: number) {
  return action(async () => {
    const user = await requireUser();
    await requireWorkspace(user.id, workspaceId, "EDITOR");
    const plan = await db.researchPlan.findFirst({ where: { id: planId, workspaceId, createdById: user.id, status: "DRAFT" }, include: { items: true } });
    if (!plan) throw new AppError("Plan not found or already launched.", "NOT_FOUND");
    const items = ItemsSchema.parse(itemsInput);
    for (const it of items) {
      if (!plan.items.some((x) => x.id === it.id)) continue;
      await db.researchPlanItem.update({ where: { id: it.id }, data: { instruction: it.instruction, queries: plan.scope.startsWith("DISCOVER") || plan.scope === "VERIFY_COMPANIES" ? [it.queries[0]] : it.queries } });
    }
    const removed = plan.items.filter((x) => !items.some((i) => i.id === x.id));
    if (removed.length && removed.length < plan.items.length) await db.researchPlanItem.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
    const fresh = await db.researchPlanItem.findMany({ where: { planId } });
    const rows = plan.rowIds.length || (plan.datasetId ? await db.datasetRow.count({ where: { datasetId: plan.datasetId } }) : 0);
    const estimated = plan.scope === "VERIFY_COMPANIES"
      ? estimateVerifyCredits(fresh.length)
      : plan.scope.startsWith("DISCOVER")
      ? estimateDiscoveryCredits(fresh.length)
      : estimateEnrichCredits(rows * fresh.length, Math.max(...fresh.map((f) => f.queries.length)));
    await db.researchPlan.update({ where: { id: planId }, data: { estimatedCredits: estimated, ...(maxResults ? { maxResults: Math.min(100, Math.max(1, maxResults)) } : {}) } });
    return planView(planId, user.id);
  });
}

export async function launchResearch(workspaceId: string, planId: string, budget: number) {
  return action(async () => {
    const user = await requireUser();
    await requireWorkspace(user.id, workspaceId, "EDITOR");
    rateLimit(`launch:${user.id}`, 10, 60_000);
    const job = await launchPlan(user, planId, Math.round(budget));
    revalidatePath(`/app/w/${workspaceId}/research`);
    return { jobId: job.id };
  });
}

export async function cancelResearch(workspaceId: string, jobId: string) {
  return action(async () => {
    const user = await requireUser();
    await requireWorkspace(user.id, workspaceId, "EDITOR");
    await cancelJob(user, jobId);
    revalidatePath(`/app/w/${workspaceId}/research`);
    return null;
  });
}

export async function jobStatus(workspaceId: string, jobId: string) {
  return action(async () => {
    const user = await requireUser();
    await requireWorkspace(user.id, workspaceId, "VIEWER");
    const job = await db.researchJob.findFirst({ where: { id: jobId, workspaceId }, include: { logs: { orderBy: { createdAt: "desc" }, take: 30 } } });
    if (!job) throw new AppError("Job not found.", "NOT_FOUND");
    return { status: job.status, total: job.totalTasks, completed: job.completedTasks, failed: job.failedTasks, creditsUsed: job.creditsUsed, budget: job.budgetCredits, error: job.error, logs: job.logs.map((l) => ({ id: l.id, level: l.level, message: l.message, at: l.createdAt.toISOString() })) };
  });
}
