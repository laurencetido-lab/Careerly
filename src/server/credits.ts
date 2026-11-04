import type { UsageKind } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";

export const CREDIT_COST: Record<UsageKind, number> = { SEARCH: 1, EXTRACT: 1, LLM: 2 };

/** Upper-bound estimate for enriching `cells` cells (cache hits make real usage lower). */
export function estimateEnrichCredits(cells: number, queriesPerCell: number, pagesPerCell = 3) {
  return cells * (queriesPerCell * CREDIT_COST.SEARCH + pagesPerCell * CREDIT_COST.EXTRACT + CREDIT_COST.LLM);
}

export function estimateVerifyCredits(companies: number) {
  return companies * CREDIT_COST.SEARCH;
}

export function estimateDiscoveryCredits(queries: number, pagesPerQuery = 3) {
  return queries * (CREDIT_COST.SEARCH + pagesPerQuery * CREDIT_COST.EXTRACT + CREDIT_COST.LLM);
}

export function monthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function creditsUsedThisMonth(userId: string) {
  const agg = await db.usageRecord.aggregate({ where: { userId, createdAt: { gte: monthStart() } }, _sum: { credits: true } });
  return agg._sum.credits ?? 0;
}

/** Credits reserved by queued/running jobs that have not been consumed yet. */
export async function creditsReserved(userId: string) {
  const jobs = await db.researchJob.findMany({ where: { createdById: userId, status: { in: ["QUEUED", "RUNNING"] } }, select: { budgetCredits: true, creditsUsed: true } });
  return jobs.reduce((a, j) => a + Math.max(0, j.budgetCredits - j.creditsUsed), 0);
}

export async function creditSummary(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { monthlyCredits: true } });
  const used = await creditsUsedThisMonth(userId);
  const reserved = await creditsReserved(userId);
  return { allowance: user.monthlyCredits, used, reserved, available: Math.max(0, user.monthlyCredits - used - reserved) };
}

export async function assertCreditsAvailable(userId: string, budget: number) {
  const s = await creditSummary(userId);
  if (budget > s.available) {
    throw new AppError(`This needs a budget of ${budget} credits but only ${s.available} are available this month.`, "QUOTA");
  }
}
