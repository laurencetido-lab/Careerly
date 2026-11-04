import { BraveSearch } from "./brave";
import { ClaudeLlm } from "./anthropic";
import { DirectFetcher } from "./fetcher";
import { FirecrawlExtract } from "./firecrawl";
import { TavilySearch } from "./tavily";
import type { ExtractProvider, LlmProvider, SearchProvider } from "./types";

export interface Providers {
  search: SearchProvider | null;
  extract: ExtractProvider;
  llm: LlmProvider | null;
}

let override: Providers | null = null;

/** Test-only hook: lets automated tests inject deterministic providers. Never used by the app. */
export function __setProvidersForTests(p: Providers | null) {
  if (process.env.NODE_ENV === "production") throw new Error("not allowed in production");
  override = p;
}

export function getProviders(): Providers {
  if (override) return override;
  const env = process.env;
  const search = env.TAVILY_API_KEY ? new TavilySearch(env.TAVILY_API_KEY) : env.BRAVE_SEARCH_API_KEY ? new BraveSearch(env.BRAVE_SEARCH_API_KEY) : null;
  const extract = env.FIRECRAWL_API_KEY ? new FirecrawlExtract(env.FIRECRAWL_API_KEY) : new DirectFetcher();
  const llm = env.ANTHROPIC_API_KEY ? new ClaudeLlm(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL || "claude-opus-5-5") : null;
  return { search, extract, llm };
}

/** Safe-to-display configuration status (never includes secrets). */
export function providerStatus() {
  const env = process.env;
  return {
    search: env.TAVILY_API_KEY ? "Tavily" : env.BRAVE_SEARCH_API_KEY ? "Brave Search" : null,
    extract: env.FIRECRAWL_API_KEY ? "Firecrawl" : "Built-in fetcher (robots.txt-aware)",
    llm: env.ANTHROPIC_API_KEY ? `Anthropic Claude (${env.ANTHROPIC_MODEL || "claude-opus-5-5"})` : null,
    researchReady: Boolean((env.TAVILY_API_KEY || env.BRAVE_SEARCH_API_KEY) && env.ANTHROPIC_API_KEY),
  };
}
