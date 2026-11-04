import { db } from "./db";
import { creditSummary } from "./credits";
import { notify, notifyWorkspace } from "./notifications";
import { researchReadiness, runJob } from "./research/jobs";
import { enqueueResearchJob } from "./queue";
import type { Providers } from "./providers";

export function nextRunFrom(from: Date, frequency: string, intervalDays: number) {
  const days = frequency === "DAILY" ? 1 : frequency === "WEEKLY" ? 7 : frequency === "MONTHLY" ? 30 : Math.min(90, Math.max(1, intervalDays));
  return new Date(from.getTime() + days * 86400_000);
}

/** Create refresh jobs for monitoring rules that are due. Budget = min(rule cap, user's available credits). */
export async function runDueMonitoringRules(opts: { providers?: Providers; inline?: boolean } = {}) {
  const due = await db.monitoringRule.findMany({ where: { enabled: true, nextRunAt: { lte: new Date() } }, take: 50 });
  const created: string[] = [];
  for (const rule of due) {
    await db.monitoringRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date(), nextRunAt: nextRunFrom(new Date(), rule.frequency, rule.intervalDays) } });
    const notReady = researchReadiness("COLUMN", opts.providers);
    if (notReady) {
      await notify({ userId: rule.createdById, workspaceId: rule.workspaceId, type: "MONITOR_SKIPPED", title: `Monitoring "${rule.name}" skipped`, body: notReady, link: `/app/settings`, dedupeKey: `monitor-skip:${rule.id}:${new Date().toISOString().slice(0, 10)}` });
      continue;
    }
    const { available } = await creditSummary(rule.createdById);
    const budget = Math.min(rule.creditCapPerRun, available);
    if (budget < 5) {
      await notify({ userId: rule.createdById, workspaceId: rule.workspaceId, type: "MONITOR_SKIPPED", title: `Monitoring "${rule.name}" paused: no credits left this month`, link: `/app/settings`, dedupeKey: `monitor-credits:${rule.id}:${new Date().toISOString().slice(0, 7)}` });
      continue;
    }
    const fields = await db.fieldDefinition.findMany({ where: { id: { in: rule.fieldIds }, datasetId: rule.datasetId } });
    const rows = await db.datasetRow.findMany({ where: { datasetId: rule.datasetId }, select: { id: true }, orderBy: { position: "asc" } });
    if (!fields.length || !rows.length) continue;
    const plan = await db.researchPlan.create({
      data: {
        workspaceId: rule.workspaceId,
        datasetId: rule.datasetId,
        createdById: rule.createdById,
        objective: `Scheduled monitoring: ${rule.name}`,
        scope: "COLUMN",
        status: "APPROVED",
        approvedAt: new Date(),
        budgetCredits: budget,
        estimatedCredits: budget,
        items: { create: fields.map((f, i) => ({ fieldId: f.id, instruction: f.researchPrompt ?? `Find ${f.name}`, queries: [], position: i })) },
      },
    });
    const job = await db.researchJob.create({
      data: {
        workspaceId: rule.workspaceId,
        planId: plan.id,
        monitoringRuleId: rule.id,
        createdById: rule.createdById,
        scope: "COLUMN",
        budgetCredits: budget,
        totalTasks: rows.length * fields.length,
        tasks: { create: rows.flatMap((r) => fields.map((f) => ({ rowId: r.id, fieldId: f.id, query: "" }))) },
      },
    });
    created.push(job.id);
    if (opts.inline) await runJob(job.id, opts.providers);
    else await enqueueResearchJob(job.id);
  }
  return created;
}

/** Daily sweep: approaching deadlines and due networking follow-ups (deduplicated, no invented urgency). */
export async function deadlineSweep(now = new Date()) {
  const soon = new Date(now.getTime() + 7 * 86400_000);
  const opps = await db.opportunity.findMany({ where: { deadline: { gte: now, lte: soon }, status: { not: "CONFIRMED_CLOSED" } }, include: { company: true } });
  for (const o of opps) {
    const days = Math.ceil((o.deadline!.getTime() - now.getTime()) / 86400_000);
    await notifyWorkspace(o.workspaceId, { type: "DEADLINE", title: `Deadline in ${days} day${days === 1 ? "" : "s"}: ${o.title}${o.company ? ` · ${o.company.name}` : ""}`, body: `Deadline ${o.deadline!.toISOString().slice(0, 10)} (source: ${o.sourceUrl ?? "entered manually"})`, link: `/app/w/${o.workspaceId}/opportunities`, dedupeKey: `deadline:opp:${o.id}:${o.deadline!.toISOString().slice(0, 10)}` });
  }
  const apps = await db.application.findMany({ where: { deadline: { gte: now, lte: soon }, stage: { in: ["RESEARCHING", "INTERESTED", "NETWORKING"] } }, include: { company: true } });
  for (const a of apps) {
    await notifyWorkspace(a.workspaceId, { type: "DEADLINE", title: `Application deadline ${a.deadline!.toISOString().slice(0, 10)}: ${a.role}${a.company ? ` · ${a.company.name}` : ""}`, link: `/app/w/${a.workspaceId}/applications`, dedupeKey: `deadline:app:${a.id}:${a.deadline!.toISOString().slice(0, 10)}` });
  }
  const follow = await db.networkingInteraction.findMany({ where: { followUpAt: { lte: now }, followUpDone: false }, include: { contact: true } });
  for (const f of follow) {
    await notifyWorkspace(f.workspaceId, { type: "FOLLOW_UP", title: `Follow up with ${f.contact.fullName}`, body: f.nextAction ?? undefined, link: `/app/w/${f.workspaceId}/networking/${f.contactId}`, dedupeKey: `follow:${f.id}` });
  }
  return { opportunities: opps.length, applications: apps.length, followUps: follow.length };
}
