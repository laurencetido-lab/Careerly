import type { UsageKind } from "@prisma/client";
import { CREDIT_COST } from "../credits";
import { db } from "../db";
import { getProviders, type Providers } from "../providers";
import { ProviderError, type ExtractedPage, type SearchOptions, type SearchResult } from "../providers/types";
import { cachedPage, cachedSearch, storePage, storeSearch } from "./cache";

export class BudgetExhausted extends Error {
  constructor() {
    super("The approved research budget for this job has been used.");
  }
}
export class JobCancelled extends Error {
  constructor() {
    super("Job cancelled");
  }
}

const lastCall = new Map<string, number>();
async function pace(provider: string, minIntervalMs: number) {
  const now = Date.now();
  const wait = (lastCall.get(provider) ?? 0) + minIntervalMs - now;
  lastCall.set(provider, Math.max(now, now + wait));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e instanceof ProviderError && !e.retryable) throw e;
      if (e instanceof BudgetExhausted || e instanceof JobCancelled) throw e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw last;
}

/**
 * Everything a research task needs: providers, budget-aware spending, caching, logging and
 * cancellation checks. All provider calls go through here so credits are always accounted.
 */
export class ResearchContext {
  providers: Providers;
  constructor(
    public job: { id: string; workspaceId: string; createdById: string },
    providers?: Providers,
  ) {
    this.providers = providers ?? getProviders();
  }

  async log(level: "info" | "warn" | "error", message: string) {
    await db.researchLog.create({ data: { jobId: this.job.id, level, message: message.slice(0, 2000) } });
  }

  async checkCancelled() {
    const j = await db.researchJob.findUnique({ where: { id: this.job.id }, select: { cancelRequested: true } });
    if (!j || j.cancelRequested) throw new JobCancelled();
  }

  /** Atomically reserve credits against the job budget; throws when the budget would be exceeded. */
  async spend(kind: UsageKind, provider: string, tokens?: { inputTokens: number; outputTokens: number }) {
    const credits = CREDIT_COST[kind];
    const updated = await db.$executeRaw`
      UPDATE "ResearchJob" SET "creditsUsed" = "creditsUsed" + ${credits}
      WHERE id = ${this.job.id} AND "creditsUsed" + ${credits} <= "budgetCredits"`;
    if (updated === 0) throw new BudgetExhausted();
    const rec = await db.usageRecord.create({
      data: {
        userId: this.job.createdById,
        workspaceId: this.job.workspaceId,
        jobId: this.job.id,
        kind,
        provider,
        credits,
        inputTokens: tokens?.inputTokens ?? 0,
        outputTokens: tokens?.outputTokens ?? 0,
      },
      select: { id: true },
    });
    return rec.id;
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const sp = this.providers.search;
    if (!sp) throw new ProviderError("No web search provider is configured.", false);
    const c = await cachedSearch(sp.name, query, opts);
    if (c.results) return c.results;
    await this.checkCancelled();
    await this.spend("SEARCH", sp.name);
    await pace(sp.name, 300);
    const results = await withRetry(() => sp.search(query, opts));
    await storeSearch(sp.name, c.key, query, results);
    return results;
  }

  async extract(url: string): Promise<(ExtractedPage & { fetchedAt: Date }) | null> {
    const hit = await cachedPage(url);
    if (hit) return hit;
    await this.checkCancelled();
    const ep = this.providers.extract;
    await this.spend("EXTRACT", ep.name);
    await pace(`${ep.name}:${safeHost(url)}`, 1000);
    try {
      const page = await withRetry(() => ep.extract(url), 2);
      if (!page || page.content.trim().length < 50) return null;
      await storePage(page);
      return { ...page, fetchedAt: new Date() };
    } catch (e) {
      await this.log("warn", `Could not read ${url}: ${(e as Error).message}`);
      return null;
    }
  }

  async llmJson<T>(args: Parameters<NonNullable<Providers["llm"]>["json"]>[0] & { schema: import("zod").ZodType<T> }) {
    const llm = this.providers.llm;
    if (!llm) throw new ProviderError("No AI provider is configured.", false);
    await this.checkCancelled();
    // Reserve first so a budget overrun never triggers an unpaid call.
    const usageId = await this.spend("LLM", llm.name);
    const res = await withRetry(() => llm.json(args), 2);
    await db.usageRecord.update({
      where: { id: usageId },
      data: { inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens },
    });
    return res.data;
  }
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid";
  }
}
