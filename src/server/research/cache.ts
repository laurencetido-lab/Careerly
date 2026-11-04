import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { ExtractedPage, SearchOptions, SearchResult } from "../providers/types";

const SEARCH_TTL = 7 * 24 * 3600_000;
const PAGE_TTL = 24 * 3600_000;

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export async function cachedSearch(provider: string, query: string, opts: SearchOptions) {
  const key = hash(JSON.stringify([query.trim().toLowerCase(), opts.country ?? null, opts.language ?? null, opts.maxResults ?? 8]));
  const hit = await db.searchCache.findUnique({ where: { provider_queryHash: { provider, queryHash: key } } });
  if (hit && hit.expiresAt > new Date()) return { results: hit.results as unknown as SearchResult[], cached: true, key };
  return { results: null, cached: false, key };
}

export async function storeSearch(provider: string, key: string, query: string, results: SearchResult[]) {
  const data = { results: results as unknown as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + SEARCH_TTL), createdAt: new Date() };
  await db.searchCache.upsert({ where: { provider_queryHash: { provider, queryHash: key } }, create: { provider, queryHash: key, query, ...data }, update: data });
}

export async function cachedPage(url: string): Promise<(ExtractedPage & { fetchedAt: Date }) | null> {
  const hit = await db.pageCache.findUnique({ where: { urlHash: hash(url) } });
  if (hit && hit.expiresAt > new Date()) return { url: hit.url, title: hit.title, content: hit.content, fetchedAt: hit.fetchedAt };
  return null;
}

export async function storePage(page: ExtractedPage) {
  const data = { url: page.url, title: page.title, content: page.content, fetchedAt: new Date(), expiresAt: new Date(Date.now() + PAGE_TTL) };
  await db.pageCache.upsert({ where: { urlHash: hash(page.url) }, create: { urlHash: hash(page.url), ...data }, update: data });
}
