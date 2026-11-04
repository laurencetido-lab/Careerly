import type { ResearchJob, User } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import { assertCreditsAvailable } from "../credits";
import { notify } from "../notifications";
import { getProviders, type Providers } from "../providers";
import { ProviderError } from "../providers/types";
import { enqueueResearchJob } from "../queue";
import { BudgetExhausted, JobCancelled, ResearchContext } from "./context";
import { discoverContacts, discoverEmployers, discoverOpportunities } from "./discover";
import { enrichCell } from "./enrich";

export function researchReadiness(scope: string, p: Providers = getProviders()) {
  if (!p.search) return "Web search is not configured. Add a Tavily or Brave Search API key (see Settings → Research providers), or use manual research.";
  if (scope !== "DISCOVER_CONTACTS" && !p.llm) return "The AI extraction provider is not configured. Add an Anthropic API key (see Settings → Research providers), or use manual research.";
  return null;
}

/** Approve a plan with a budget, create idempotent tasks and enqueue the job. */
export async function launchPlan(user: User, planId: string, budget: number, opts: { providers?: Providers; enqueue?: boolean } = {}) {
  const plan = await db.researchPlan.findFirst({ where: { id: planId, createdById: user.id }, include: { items: true, dataset: true } });
  if (!plan) throw new AppError("Plan not found.", "NOT_FOUND");
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: plan.workspaceId, userId: user.id } } });
  if (!member || member.role === "VIEWER") throw new AppError("Plan not found.", "NOT_FOUND");
  if (plan.status !== "DRAFT") throw new AppError("This plan was already launched.", "CONFLICT");
  const notReady = researchReadiness(plan.scope, opts.providers);
  if (notReady) throw new AppError(notReady, "NOT_CONFIGURED");
  if (!Number.isInteger(budget) || budget < 1) throw new AppError("Set a budget of at least 1 credit.", "INVALID");
  await assertCreditsAvailable(user.id, budget);

  const tasks: { rowId: string | null; fieldId: string | null; query: string | null }[] = [];
  if (plan.scope.startsWith("DISCOVER")) {
    for (const it of plan.items) tasks.push({ rowId: null, fieldId: null, query: it.queries[0] ?? it.instruction });
  } else {
    const rowIds = plan.rowIds.length
      ? (await db.datasetRow.findMany({ where: { id: { in: plan.rowIds }, datasetId: plan.datasetId! }, select: { id: true } })).map((r) => r.id)
      : (await db.datasetRow.findMany({ where: { datasetId: plan.datasetId! }, orderBy: { position: "asc" }, select: { id: true } })).map((r) => r.id);
    for (const r of rowIds) for (const it of plan.items) tasks.push({ rowId: r, fieldId: it.fieldId, query: "" });
  }
  if (!tasks.length) throw new AppError("Nothing to research in this plan.", "INVALID");

  const job = await db.$transaction(async (tx) => {
    await tx.researchPlan.update({ where: { id: plan.id }, data: { status: "APPROVED", approvedAt: new Date(), budgetCredits: budget } });
    return tx.researchJob.create({
      data: {
        workspaceId: plan.workspaceId,
        planId: plan.id,
        createdById: user.id,
        scope: plan.scope,
        budgetCredits: budget,
        totalTasks: tasks.length,
        tasks: { create: tasks.map((t) => ({ ...t, query: t.query ?? "" })) },
      },
    });
  });
  await audit({ userId: user.id, workspaceId: plan.workspaceId, action: "research.launch", targetType: "ResearchJob", targetId: job.id, detail: `${plan.scope} · ${tasks.length} tasks · budget ${budget}` });
  if (opts.enqueue !== false) await enqueueResearchJob(job.id);
  return job;
}

export async function cancelJob(user: User, jobId: string) {
  const job = await db.researchJob.findFirst({ where: { id: jobId, workspace: { members: { some: { userId: user.id, role: { in: ["OWNER", "EDITOR"] } } } } } });
  if (!job) throw new AppError("Job not found.", "NOT_FOUND");
  if (!["QUEUED", "RUNNING"].includes(job.status)) return job;
  return db.researchJob.update({ where: { id: job.id }, data: { cancelRequested: true, ...(job.status === "QUEUED" ? { status: "CANCELLED", finishedAt: new Date() } : {}) } });
}

/** Execute a job. Safe to call repeatedly (tasks already succeeded are skipped). */
export async function runJob(jobId: string, providers?: Providers) {
  const job = await db.researchJob.findUnique({ where: { id: jobId }, include: { plan: { include: { items: { include: { field: true } } } } } });
  if (!job || ["SUCCEEDED", "FAILED", "CANCELLED", "PARTIAL"].includes(job.status)) return;
  if (job.cancelRequested) {
    await finish(job, "CANCELLED");
    return;
  }
  // Re-check authorization in the worker: the creator must still be a member.
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: job.workspaceId, userId: job.createdById } } });
  if (!member || member.role === "VIEWER") {
    await db.researchJob.update({ where: { id: job.id }, data: { status: "FAILED", error: "Job creator no longer has access", finishedAt: new Date() } });
    return;
  }
  await db.researchJob.update({ where: { id: job.id }, data: { status: "RUNNING", startedAt: job.startedAt ?? new Date() } });
  const ctx = new ResearchContext(job, providers);
  const monitoring = Boolean(job.monitoringRuleId);
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: job.workspaceId } });
  const items = job.plan?.items ?? [];
  let stop: "budget" | "cancel" | null = null;

  const pending = await db.researchTask.findMany({ where: { jobId: job.id, status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { id: "asc" } });
  for (const task of pending) {
    if (stop) break;
    await db.researchTask.update({ where: { id: task.id }, data: { status: "RUNNING", attempts: { increment: 1 } } });
    try {
      let r: { status: string; summary?: string };
      if (job.scope === "DISCOVER_COMPANIES") {
        r = await discoverEmployers(ctx, { planId: job.planId!, query: task.query!, objective: job.plan!.objective, maxResults: job.plan!.maxResults });
      } else if (job.scope === "DISCOVER_CONTACTS") {
        r = await discoverContacts(ctx, { companyId: job.plan!.companyId!, query: task.query!, roles: ws.targetRoles, locations: ws.targetLocations, maxResults: job.plan!.maxResults });
      } else if (job.scope === "DISCOVER_OPPORTUNITIES") {
        r = await discoverOpportunities(ctx, { companyId: job.plan!.companyId!, query: task.query!, objective: ws.objective });
      } else {
        const item = items.find((i) => i.fieldId === task.fieldId);
        const field = item?.field ?? (await db.fieldDefinition.findFirst({ where: { id: task.fieldId!, dataset: { workspaceId: job.workspaceId } } }));
        if (!field) throw new ProviderError("Field was deleted", false);
        r = await enrichCell(ctx, {
          rowId: task.rowId!,
          field,
          instruction: item?.instruction ?? field.researchPrompt ?? `Find ${field.name}`,
          queries: item?.queries ?? [],
          reason: monitoring ? "Scheduled monitoring refresh" : "Research job",
          notifyChanges: monitoring,
        });
      }
      await db.researchTask.update({ where: { id: task.id }, data: { status: "SUCCEEDED", result: r.summary?.slice(0, 500) ?? r.status, error: null } });
      await db.researchJob.update({ where: { id: job.id }, data: { completedTasks: { increment: 1 } } });
      if (r.summary) await ctx.log("info", r.summary);
    } catch (e) {
      if (e instanceof BudgetExhausted) {
        stop = "budget";
        await db.researchTask.update({ where: { id: task.id }, data: { status: "QUEUED" } });
        await ctx.log("warn", e.message);
        break;
      }
      if (e instanceof JobCancelled) {
        stop = "cancel";
        await db.researchTask.update({ where: { id: task.id }, data: { status: "CANCELLED" } });
        break;
      }
      const msg = (e as Error).message ?? "error";
      const final = !(e instanceof ProviderError && e.retryable) || task.attempts + 1 >= 3;
      await db.researchTask.update({ where: { id: task.id }, data: { status: final ? "FAILED" : "QUEUED", error: msg.slice(0, 500) } });
      if (final) await db.researchJob.update({ where: { id: job.id }, data: { failedTasks: { increment: 1 } } });
      await ctx.log("error", `Task failed: ${msg}`);
    }
  }

  const fresh = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
  if (stop === "cancel" || fresh.cancelRequested) {
    await db.researchTask.updateMany({ where: { jobId: job.id, status: "QUEUED" }, data: { status: "CANCELLED" } });
    return finish(fresh, "CANCELLED");
  }
  if (stop === "budget") {
    await db.researchTask.updateMany({ where: { jobId: job.id, status: "QUEUED" }, data: { status: "CANCELLED", error: "Budget reached" } });
    return finish(fresh, "PARTIAL", "Stopped when the approved budget was reached.");
  }
  const retryable = await db.researchTask.count({ where: { jobId: job.id, status: "QUEUED" } });
  if (retryable > 0) throw new Error(`${retryable} task(s) hit temporary errors; the queue will retry.`);
  if (fresh.failedTasks === 0) return finish(fresh, "SUCCEEDED");
  return finish(fresh, fresh.completedTasks > 0 ? "PARTIAL" : "FAILED", `${fresh.failedTasks} task(s) failed.`);
}

async function finish(job: ResearchJob, status: "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELLED", error?: string) {
  const done = await db.researchJob.update({ where: { id: job.id }, data: { status, finishedAt: new Date(), error: error ?? null } });
  if (status !== "CANCELLED" && !job.monitoringRuleId) {
    await notify({
      userId: job.createdById,
      workspaceId: job.workspaceId,
      type: "RESEARCH_DONE",
      title: status === "SUCCEEDED" ? "Research finished" : status === "PARTIAL" ? "Research partly finished" : "Research failed",
      body: `${done.completedTasks}/${done.totalTasks} tasks · ${done.creditsUsed} credits used${error ? ` · ${error}` : ""}`,
      link: `/app/w/${job.workspaceId}/research?job=${job.id}`,
      dedupeKey: `job-done:${job.id}`,
    });
  }
  return done;
}
