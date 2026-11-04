import type { CompanyVerification } from "@prisma/client";
import { domainOf, normalizeName } from "@/lib/fields";
import { db } from "../db";
import { notifyWorkspace } from "../notifications";
import type { SearchResult } from "../providers/types";
import type { ResearchContext } from "./context";

/** Words too generic to identify an employer on their own. */
const GENERIC = new Set([
  "capital", "partners", "partner", "group", "groupe", "asset", "assets", "management", "investment", "investments", "investissement",
  "bank", "banque", "conseil", "consulting", "fund", "funds", "fonds", "holding", "holdings", "international", "france", "europe",
  "global", "advisors", "advisory", "finance", "financial", "services", "real", "estate", "immobilier", "company", "and", "et", "des", "les",
]);

/** Directory / profile sites: they prove an organisation is referenced, not that we found its own site. */
const DIRECTORIES = ["linkedin.com", "wikipedia.org", "crunchbase.com", "pitchbook.com", "bloomberg.com", "societe.com", "pappers.fr", "infogreffe.fr", "glassdoor.com", "glassdoor.fr", "indeed.com", "welcometothejungle.com", "companieshouse.gov.uk", "find-and-update.company-information.service.gov.uk", "dnb.com", "zoominfo.com", "craft.co"];

const isDirectory = (d: string) => DIRECTORIES.some((x) => d === x || d.endsWith(`.${x}`));

export function distinctiveTokens(name: string) {
  const all = normalizeName(name).split(" ").filter(Boolean);
  const toks = all.filter((t) => t.length >= 3 && !GENERIC.has(t));
  return toks.length ? toks : all.length ? [all.join("")] : [];
}

export interface PresenceResult {
  status: Exclude<CompanyVerification, "UNVERIFIED">;
  sourceUrl: string | null;
  website: string | null;
  note: string;
}

/**
 * Decide from public search results whether an employer exists online.
 * VERIFIED: a result on a domain carrying the employer's distinctive name, whose title names it.
 * AMBIGUOUS: only directories or third parties mention it. NOT_FOUND: nothing names it.
 * Deterministic on purpose: no model can "agree" that an invented company exists.
 */
export function assessPresence(name: string, results: SearchResult[]): PresenceResult {
  const toks = distinctiveTokens(name);
  if (!toks.length) return { status: "NOT_FOUND", sourceUrl: null, website: null, note: "The name has no distinctive word to search for." };
  const full = normalizeName(name);
  const mentions = (r: SearchResult) => {
    const text = normalizeName(`${r.title} ${r.snippet}`);
    return text.includes(full) || toks.every((t) => text.includes(t));
  };
  for (const r of results) {
    const d = domainOf(r.url);
    if (!d || isDirectory(d)) continue;
    const label = d.split(".").slice(0, -1).join("").replace(/[^a-z0-9]/g, "");
    const joined = toks.join("");
    const domainMatches = label.includes(joined) || (toks[0].length >= 4 && label.includes(toks[0]));
    const titleMatches = normalizeName(r.title).includes(toks[0]);
    if (domainMatches && titleMatches) {
      const u = new URL(r.url);
      return { status: "VERIFIED", sourceUrl: r.url, website: `${u.protocol}//${u.host}`, note: `Official-looking site found: ${d}` };
    }
  }
  const named = results.filter(mentions);
  const dir = named.find((r) => isDirectory(domainOf(r.url) ?? ""));
  if (dir) return { status: "AMBIGUOUS", sourceUrl: dir.url, website: null, note: `Listed on ${domainOf(dir.url)}, but no official website was found.` };
  if (named.length >= 2) return { status: "AMBIGUOUS", sourceUrl: named[0].url, website: null, note: `Mentioned by ${named.length} public pages, but no official website was found.` };
  return { status: "NOT_FOUND", sourceUrl: null, website: null, note: "No public web page names this employer. Check the spelling." };
}

export async function verifyCompany(ctx: ResearchContext, args: { companyId: string; query: string }) {
  const company = await db.company.findFirstOrThrow({ where: { id: args.companyId, workspaceId: ctx.job.workspaceId } });
  const results = await ctx.search(args.query, { maxResults: 8 });
  const res = assessPresence(company.name, results);
  await db.company.update({
    where: { id: company.id },
    data: {
      verifyStatus: res.status,
      verifiedAt: new Date(),
      verifySource: res.sourceUrl,
      verifyNote: res.note,
      ...(res.website && !company.website ? { website: res.website, domain: domainOf(res.website) } : {}),
    },
  });
  // Fill an empty "website" cell for rows of this company
  if (res.website && !company.website) {
    const rows = await db.datasetRow.findMany({ where: { companyId: company.id }, include: { dataset: { include: { fields: { where: { coreBinding: "company.website" } } } } } });
    for (const r of rows) {
      const f = r.dataset.fields[0];
      if (!f) continue;
      const existing = await db.fieldValue.findUnique({ where: { rowId_fieldId: { rowId: r.id, fieldId: f.id } } });
      if (existing?.textValue || existing?.manuallyConfirmed) continue;
      await db.fieldValue.upsert({
        where: { rowId_fieldId: { rowId: r.id, fieldId: f.id } },
        create: { rowId: r.id, fieldId: f.id, textValue: res.website, origin: "RESEARCH", confidence: "REPORTED", researchedAt: new Date(), researchJobId: ctx.job.id, researchNotes: res.note },
        update: { textValue: res.website, origin: "RESEARCH", confidence: "REPORTED", researchedAt: new Date(), researchJobId: ctx.job.id, researchNotes: res.note },
      });
    }
  }
  if (res.status === "NOT_FOUND") {
    await notifyWorkspace(ctx.job.workspaceId, {
      type: "COMPANY_NOT_FOUND",
      title: `${company.name} could not be found online`,
      body: "Check the spelling, or remove it if it is not a real employer.",
      link: `/app/w/${ctx.job.workspaceId}/data`,
      dedupeKey: `notfound:${company.id}:${ctx.job.id}`,
    });
  }
  return { status: "written" as const, summary: `${company.name}: ${res.status.toLowerCase()} (${res.note})` };
}
