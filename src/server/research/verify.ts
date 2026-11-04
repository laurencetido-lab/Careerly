import type { Confidence } from "@prisma/client";
import { parseNumberLoose } from "@/lib/fields";

/** Normalise text for robust verbatim matching (whitespace, quotes, dashes, markdown). */
export function normalizeForMatch(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚′`]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[*_#>|~]+/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[\s  ]+/g, " ")
    .trim();
}

/**
 * True if the excerpt genuinely appears in the source text. Excerpts may use "..." to join
 * fragments, each of which must appear in order. Very short excerpts are rejected.
 */
export function excerptInSource(excerpt: string, source: string) {
  const ex = normalizeForMatch(excerpt);
  if (ex.replace(/[^a-z0-9]/g, "").length < 8) return false;
  const src = normalizeForMatch(source);
  const parts = ex.split(/\s*(?:\.\.\.|…)\s*/).filter((p) => p.length > 0);
  let from = 0;
  for (const p of parts) {
    const i = src.indexOf(p, from);
    if (i < 0) return false;
    from = i + p.length;
  }
  return true;
}

/** Numbers (with k/m suffixes) mentioned in a text. */
export function numbersIn(text: string) {
  const out: number[] = [];
  const re = /(?:€|\$|£|CHF\s?)?\d{1,3}(?:[\s.,  ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?[kKmM]?\b/g;
  for (const m of text.match(re) ?? []) {
    const n = parseNumberLoose(m.replace(/\s(?=[kKmM]$)/, ""));
    if (n !== null) out.push(n);
  }
  return out;
}

/** A numeric value is supported if the excerpt mentions it (±0.5% tolerance for rounding). */
export function numberSupported(value: number, excerpt: string) {
  return numbersIn(excerpt).some((n) => Math.abs(n - value) <= Math.max(1, Math.abs(value) * 0.005));
}

export interface EvidenceCandidate {
  sourceIndex: number;
  excerpt: string;
  valueInSource?: string | null;
}

export interface SourceDoc {
  url: string;
  title: string | null;
  text: string;
  tier: number;
}

export interface Decision {
  confidence: Confidence;
  validEvidence: (EvidenceCandidate & { source: SourceDoc })[];
  rejected: { reason: string; candidate: EvidenceCandidate }[];
}

/**
 * Anti-fabrication gate applied to every AI extraction:
 *  - evidence must quote the source verbatim
 *  - numeric values must appear in at least one valid excerpt
 *  - VERIFIED requires an official (tier 1–2) source, otherwise downgraded to REPORTED
 *  - disagreeing sources → CONFLICTING; no valid evidence → UNKNOWN
 */
export function decide(args: {
  claimed: Confidence;
  found: boolean;
  numericValue?: number | null;
  evidence: EvidenceCandidate[];
  sources: SourceDoc[];
}): Decision {
  const rejected: Decision["rejected"] = [];
  const valid: Decision["validEvidence"] = [];
  for (const c of args.evidence) {
    const src = args.sources[c.sourceIndex];
    if (!src) {
      rejected.push({ reason: "unknown source", candidate: c });
      continue;
    }
    if (!excerptInSource(c.excerpt, src.text)) {
      rejected.push({ reason: "excerpt not found in source", candidate: c });
      continue;
    }
    valid.push({ ...c, source: src });
  }
  if (!args.found || valid.length === 0) return { confidence: "UNKNOWN", validEvidence: valid, rejected };

  if (args.numericValue != null) {
    const supporting = valid.filter((v) => numberSupported(args.numericValue!, v.excerpt));
    if (supporting.length === 0) {
      return { confidence: "UNKNOWN", validEvidence: [], rejected: [...rejected, ...valid.map((v) => ({ reason: "value not stated in excerpt", candidate: v }))] };
    }
    // Different numbers reported by different evidence → conflicting
    const reported = valid
      .map((v) => (v.valueInSource ? parseNumberLoose(v.valueInSource) : null))
      .filter((n): n is number => n !== null);
    const distinct = new Set(reported.map((n) => Math.round(n)));
    if (distinct.size > 1 && Math.max(...reported) > Math.min(...reported) * 1.05) {
      return { confidence: "CONFLICTING", validEvidence: valid, rejected };
    }
  }

  let confidence: Confidence = args.claimed;
  if (confidence === "UNKNOWN") confidence = "REPORTED";
  if (confidence === "VERIFIED" && !valid.some((v) => v.source.tier <= 2)) confidence = "REPORTED";
  return { confidence, validEvidence: valid, rejected };
}

/**
 * Focus long page text on the passages most relevant to the keywords so the model sees the
 * evidence without exceeding the per-source budget.
 */
export function focusText(text: string, keywords: string[], maxChars = 12000) {
  if (text.length <= maxChars) return text;
  const kws = keywords.map((k) => k.toLowerCase()).filter((k) => k.length > 2);
  const paras = text.split(/\n+/);
  const scored = paras.map((p, i) => {
    const l = p.toLowerCase();
    return { i, p, s: kws.reduce((acc, k) => acc + (l.includes(k) ? 1 : 0), 0) };
  });
  const keep = new Set<number>();
  let size = 0;
  for (const x of [...scored].sort((a, b) => b.s - a.s || a.i - b.i)) {
    if (x.s === 0 && size > maxChars / 3) break;
    for (const j of [x.i - 1, x.i, x.i + 1]) {
      if (j < 0 || j >= paras.length || keep.has(j)) continue;
      if (size + paras[j].length > maxChars) continue;
      keep.add(j);
      size += paras[j].length + 1;
    }
    if (size >= maxChars) break;
  }
  return [...keep].sort((a, b) => a - b).map((j) => paras[j]).join("\n");
}
