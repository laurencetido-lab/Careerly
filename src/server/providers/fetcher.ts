import { lookup } from "node:dns/promises";
import net from "node:net";
import { ProviderError, type ExtractedPage, type ExtractProvider } from "./types";

const UA = "CareerlyResearchBot/0.1 (+https://careerly.app/bot)";
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Domains Careerly never fetches directly: they require authentication or forbid automated
 * access in their terms. Only their public search-engine result (title/snippet) is used.
 */
const NEVER_FETCH = [/(^|\.)linkedin\.com$/, /(^|\.)facebook\.com$/, /(^|\.)instagram\.com$/, /(^|\.)x\.com$/, /(^|\.)twitter\.com$/, /(^|\.)glassdoor\.[a-z.]+$/];

export function isBlockedForFetching(url: string) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return NEVER_FETCH.some((r) => r.test(h));
  } catch {
    return true;
  }
}

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const l = ip.toLowerCase();
  return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.") || l.startsWith("::ffff:10.") || l.startsWith("::ffff:192.168.");
}

/** SSRF guard: only public http(s) hosts. */
export async function assertPublicUrl(url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ProviderError("Invalid URL", false);
  }
  if (!/^https?:$/.test(u.protocol)) throw new ProviderError("Only http(s) URLs can be fetched", false);
  if (u.username || u.password) throw new ProviderError("URLs with credentials are not allowed", false);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new ProviderError("Private host", false);
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new ProviderError(`Could not resolve ${host}`, false);
  if (addrs.some((a) => isPrivateIp(a.address))) throw new ProviderError("Private network addresses are not allowed", false);
}

const robotsCache = new Map<string, { rules: { allow: boolean; path: string }[]; at: number }>();

export function parseRobots(txt: string) {
  const rules: { allow: boolean; path: string }[] = [];
  let applies = false;
  let sawAgentInGroup = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!sawAgentInGroup) applies = false;
      sawAgentInGroup = true;
      if (val === "*" || /careerly/i.test(val)) applies = true;
    } else {
      sawAgentInGroup = false;
      if (!applies) continue;
      if (key === "disallow" && val) rules.push({ allow: false, path: val });
      if (key === "allow" && val) rules.push({ allow: true, path: val });
    }
  }
  return rules;
}

export function robotsAllows(rules: { allow: boolean; path: string }[], path: string) {
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    const pattern = r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
    if (new RegExp("^" + pattern).test(path)) {
      if (!best || r.path.length > best.len || (r.path.length === best.len && r.allow)) best = { allow: r.allow, len: r.path.length };
    }
  }
  return best ? best.allow : true;
}

async function allowedByRobots(u: URL) {
  const key = u.origin;
  let entry = robotsCache.get(key);
  if (!entry || Date.now() - entry.at > 6 * 3600_000) {
    let rules: { allow: boolean; path: string }[] = [];
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`${u.origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: ctrl.signal, redirect: "follow" });
      clearTimeout(t);
      if (res.ok) rules = parseRobots((await res.text()).slice(0, 200_000));
    } catch {
      /* unreachable robots.txt → no rules */
    }
    entry = { rules, at: Date.now() };
    robotsCache.set(key, entry);
  }
  return robotsAllows(entry.rules, u.pathname + u.search);
}

export function htmlToText(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
  const published =
    html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|datePublished|date)["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
  const text = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { title: title ? htmlToTextInline(title) : null, text, published };
}

function htmlToTextInline(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

/** Built-in, robots.txt-respecting public page fetcher. Used when no extraction provider is configured. */
export class DirectFetcher implements ExtractProvider {
  name = "direct";
  async extract(url: string): Promise<ExtractedPage | null> {
    if (isBlockedForFetching(url)) return null;
    let current = url;
    for (let hop = 0; hop < 4; hop++) {
      await assertPublicUrl(current);
      const u = new URL(current);
      if (!(await allowedByRobots(u))) return null;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      let res: Response;
      try {
        res = await fetch(current, { headers: { "User-Agent": UA, Accept: "text/html,text/plain" }, redirect: "manual", signal: ctrl.signal });
      } catch (e) {
        throw new ProviderError(`Fetch failed for ${u.hostname}: ${(e as Error).message}`, true);
      } finally {
        clearTimeout(t);
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, current).toString();
        continue;
      }
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) throw new ProviderError(`${u.hostname} responded ${res.status}`, true);
        return null;
      }
      const type = res.headers.get("content-type") ?? "";
      if (!/text\/html|text\/plain|application\/xhtml/.test(type)) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const html = buf.subarray(0, MAX_BYTES).toString("utf8");
      if (type.includes("text/plain")) return { url: current, title: null, content: html };
      const { title, text, published } = htmlToText(html);
      return { url: current, title, content: text.slice(0, 200_000), publishedAt: published };
    }
    return null;
  }
}
