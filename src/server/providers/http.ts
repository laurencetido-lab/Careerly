import { ProviderError } from "./types";

/** fetch with timeout; maps HTTP failures to retryable / non-retryable provider errors. */
export async function httpJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      throw new ProviderError(`${new URL(url).hostname} responded ${res.status}: ${body}`, res.status === 429 || res.status >= 500);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Request to ${new URL(url).hostname} failed: ${(e as Error).message}`, true);
  } finally {
    clearTimeout(t);
  }
}
