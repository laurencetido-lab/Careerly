export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  publishedAt?: string | null;
  /** Some providers (Tavily) can return page text directly. */
  rawContent?: string | null;
}

export interface SearchOptions {
  maxResults?: number;
  country?: string | null;
  language?: string | null;
}

export interface SearchProvider {
  name: string;
  search(query: string, opts?: SearchOptions): Promise<SearchResult[]>;
}

export interface ExtractedPage {
  url: string;
  title: string | null;
  content: string;
  publishedAt?: string | null;
}

export interface ExtractProvider {
  name: string;
  extract(url: string): Promise<ExtractedPage | null>;
}

export interface LlmUsage { inputTokens: number; outputTokens: number }

export interface LlmProvider {
  name: string;
  model: string;
  json<T>(args: { system: string; user: string; schema: import("zod").ZodType<T>; maxTokens?: number }): Promise<{ data: T; usage: LlmUsage }>;
  text(args: { system: string; user: string; maxTokens?: number }): Promise<{ text: string; usage: LlmUsage }>;
}

export class ProviderError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}
