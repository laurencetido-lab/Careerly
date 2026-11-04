import { httpJson } from "./http";
import { assertPublicUrl, isBlockedForFetching } from "./fetcher";
import type { ExtractedPage, ExtractProvider } from "./types";

interface FirecrawlResponse {
  success: boolean;
  data?: { markdown?: string; metadata?: { title?: string; publishedTime?: string; sourceURL?: string } };
}

export class FirecrawlExtract implements ExtractProvider {
  name = "firecrawl";
  constructor(private apiKey: string) {}
  async extract(url: string): Promise<ExtractedPage | null> {
    if (isBlockedForFetching(url)) return null;
    await assertPublicUrl(url);
    const data = await httpJson<FirecrawlResponse>("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      timeoutMs: 60000,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!data.success || !data.data?.markdown) return null;
    return {
      url,
      title: data.data.metadata?.title ?? null,
      content: data.data.markdown.slice(0, 200_000),
      publishedAt: data.data.metadata?.publishedTime ?? null,
    };
  }
}
