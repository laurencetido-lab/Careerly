import { httpJson } from "./http";
import type { SearchOptions, SearchProvider, SearchResult } from "./types";

interface BraveResponse {
  web?: { results: { title: string; url: string; description?: string; page_age?: string; age?: string }[] };
}

const BRAVE_COUNTRIES = new Set(["AR","AU","AT","BE","BR","CA","CL","DK","FI","FR","DE","HK","IN","ID","IT","JP","KR","MY","MX","NL","NZ","NO","CN","PL","PT","PH","RU","SA","ZA","ES","SE","CH","TW","TR","GB","US"]);

export class BraveSearch implements SearchProvider {
  name = "brave";
  constructor(private apiKey: string) {}
  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const p = new URLSearchParams({ q: query, count: String(Math.min(opts.maxResults ?? 8, 20)) });
    const cc = opts.country?.toUpperCase();
    if (cc && BRAVE_COUNTRIES.has(cc)) p.set("country", cc);
    if (opts.language) p.set("search_lang", opts.language);
    const data = await httpJson<BraveResponse>(`https://api.search.brave.com/res/v1/web/search?${p}`, {
      headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey },
    });
    return (data.web?.results ?? []).map((r) => ({
      url: r.url,
      title: stripTags(r.title ?? ""),
      snippet: stripTags(r.description ?? ""),
      publishedAt: r.page_age ?? null,
    }));
  }
}

function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, "");
}
