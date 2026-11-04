import { httpJson } from "./http";
import type { SearchOptions, SearchProvider, SearchResult } from "./types";

interface TavilyResponse {
  results: { title: string; url: string; content: string; published_date?: string; raw_content?: string | null }[];
}

export class TavilySearch implements SearchProvider {
  name = "tavily";
  constructor(private apiKey: string) {}
  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const body: Record<string, unknown> = {
      query,
      max_results: Math.min(opts.maxResults ?? 8, 20),
      search_depth: "basic",
      include_raw_content: false,
    };
    if (opts.country) body.country = opts.country;
    const data = await httpJson<TavilyResponse>("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });
    return (data.results ?? []).map((r) => ({
      url: r.url,
      title: r.title ?? "",
      snippet: r.content ?? "",
      publishedAt: r.published_date ?? null,
      rawContent: r.raw_content ?? null,
    }));
  }
}
