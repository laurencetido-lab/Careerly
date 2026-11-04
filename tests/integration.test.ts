/**
 * Database integration tests (run against the careerpilot_test database).
 * Research tests inject deterministic test providers through the test-only hook;
 * they verify the pipeline's guarantees, not live provider behaviour.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { User, Workspace } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/server/db";
import { requireDataset, requireField, requireRow, requireWorkspace, requireContact } from "@/server/authz";
import { __setProvidersForTests, type Providers } from "@/server/providers";
import type { ExtractedPage, SearchResult } from "@/server/providers/types";
import { createEnrichPlan } from "@/server/research/plan";
import { launchPlan, runJob } from "@/server/research/jobs";
import { runDueMonitoringRules } from "@/server/monitoring";
import { exportDataset } from "@/server/export-dataset";
import { notify } from "@/server/notifications";
import { workspaceSnapshot } from "@/server/assistant";
import ExcelJS from "exceljs";

// ── Deterministic test providers ──
let pages: Record<string, string> = {};
let llmAnswer: (user: string) => unknown = () => ({});
const testProviders: Providers = {
  search: {
    name: "test-search",
    async search(q: string): Promise<SearchResult[]> {
      return Object.keys(pages)
        .filter((u) => q.toLowerCase().includes(new URL(u).hostname.split(".").slice(-2, -1)[0]))
        .map((u) => ({ url: u, title: `Page ${u}`, snippet: pages[u].slice(0, 80) }));
    },
  },
  extract: {
    name: "test-extract",
    async extract(url: string): Promise<ExtractedPage | null> {
      return pages[url] ? { url, title: "Page", content: pages[url] } : null;
    },
  },
  llm: {
    name: "test-llm",
    model: "test",
    async json<T>({ system, user }: { system: string; user: string; schema: z.ZodType<T> }) {
      if (system.includes("design web search queries")) return { data: { items: [] } as T, usage: { inputTokens: 10, outputTokens: 5 } };
      return { data: llmAnswer(user) as T, usage: { inputTokens: 100, outputTokens: 50 } };
    },
    async text() {
      return { text: "", usage: { inputTokens: 0, outputTokens: 0 } };
    },
  },
};

const answer = (o: Partial<{ found: boolean; value: string; number: number; currency: string; confidence: string; evidence: { source: number; excerpt: string; value_in_source: string | null }[] }>) => ({
  found: true, value: null, number: null, currency: null, date: null, boolean: null, url: null, confidence: "REPORTED", evidence: [], notes: null, ...o,
});

async function mkUser(email: string) {
  return db.user.create({ data: { email, name: email.split("@")[0], passwordHash: "x", monthlyCredits: 500 } });
}
async function mkWorkspace(u: User, name: string) {
  return db.workspace.create({ data: { name, ownerId: u.id, objective: "Analyst roles", targetLocations: ["Paris"], members: { create: { userId: u.id, role: "OWNER" } } } });
}
async function mkDataset(ws: Workspace, companies: { name: string; domain: string }[]) {
  const ds = await db.dataset.create({ data: { workspaceId: ws.id, name: "Funds" } });
  const name = await db.fieldDefinition.create({ data: { datasetId: ds.id, key: "company", name: "Company", type: "TEXT", isPrimary: true, coreBinding: "company.name", position: 0 } });
  const salary = await db.fieldDefinition.create({ data: { datasetId: ds.id, key: "salary", name: "Analyst Salary", type: "AI_RESEARCH", valueType: "CURRENCY", position: 1, researchPrompt: "Entry-level analyst base salary in Paris" } });
  const rows = [];
  for (const [i, c] of companies.entries()) {
    const co = await db.company.create({ data: { workspaceId: ws.id, name: c.name, normalizedName: c.name.toLowerCase(), domain: c.domain, website: `https://${c.domain}` } });
    const r = await db.datasetRow.create({ data: { datasetId: ds.id, companyId: co.id, position: i } });
    await db.fieldValue.create({ data: { rowId: r.id, fieldId: name.id, textValue: c.name, origin: "IMPORT" } });
    rows.push(r);
  }
  return { ds, name, salary, rows };
}

beforeAll(async () => {
  __setProvidersForTests(testProviders);
});
beforeEach(async () => {
  pages = {};
  await db.$executeRawUnsafe('TRUNCATE "User", "ResearchSource", "SearchCache", "PageCache" CASCADE');
});
afterAll(async () => {
  __setProvidersForTests(null);
  await db.$disconnect();
});

describe("tenant isolation", () => {
  it("prevents a user from reaching another user's workspace, rows, fields and contacts", async () => {
    const alice = await mkUser("alice@test.dev");
    const bob = await mkUser("bob@test.dev");
    const wsA = await mkWorkspace(alice, "Finance Paris");
    const wsB = await mkWorkspace(bob, "AI Internships");
    const { ds, salary, rows } = await mkDataset(wsA, [{ name: "Ardian", domain: "ardian.com" }]);
    const contact = await db.contact.create({ data: { workspaceId: wsA.id, fullName: "Jane Doe", dedupeKey: "jd" } });

    await expect(requireWorkspace(alice.id, wsA.id)).resolves.toBeTruthy();
    await expect(requireWorkspace(bob.id, wsA.id)).rejects.toThrow(/not found/i);
    // Bob uses his own workspace id with Alice's object ids → still not found
    await expect(requireDataset(wsB.id, ds.id)).rejects.toThrow(/not found/i);
    await expect(requireRow(wsB.id, rows[0].id)).rejects.toThrow(/not found/i);
    await expect(requireField(wsB.id, salary.id)).rejects.toThrow(/not found/i);
    await expect(requireContact(wsB.id, contact.id)).rejects.toThrow(/not found/i);
    await expect(exportDataset(wsB.id, ds.id)).rejects.toThrow();
    // Assistant snapshot only contains the caller's workspace data
    const snap = await workspaceSnapshot(wsB);
    expect(snap).not.toContain("Ardian");
    expect(snap).not.toContain("Jane Doe");
  });

  it("enforces roles: viewers cannot edit", async () => {
    const alice = await mkUser("alice2@test.dev");
    const carol = await mkUser("carol@test.dev");
    const ws = await mkWorkspace(alice, "Team");
    await db.workspaceMember.create({ data: { workspaceId: ws.id, userId: carol.id, role: "VIEWER" } });
    await expect(requireWorkspace(carol.id, ws.id, "VIEWER")).resolves.toBeTruthy();
    await expect(requireWorkspace(carol.id, ws.id, "EDITOR")).rejects.toThrow(/permission/i);
  });

  it("does not let a user launch another user's plan", async () => {
    const alice = await mkUser("a3@test.dev");
    const bob = await mkUser("b3@test.dev");
    const ws = await mkWorkspace(alice, "A");
    const { ds, salary } = await mkDataset(ws, [{ name: "Ardian", domain: "ardian.com" }]);
    const plan = await createEnrichPlan(alice, ws, { datasetId: ds.id, fields: [salary], rowIds: [], scope: "COLUMN", totalRows: 1 });
    await expect(launchPlan(bob, plan.id, 10, { providers: testProviders, enqueue: false })).rejects.toThrow(/not found/i);
  });
});

describe("research pipeline", () => {
  it("writes sourced values, rejects fabrications, respects confirmed values and budgets", async () => {
    const u = await mkUser("res@test.dev");
    const ws = await mkWorkspace(u, "Finance");
    const { ds, salary, rows } = await mkDataset(ws, [
      { name: "Ardian", domain: "ardian.com" },
      { name: "Tikehau", domain: "tikehau.com" },
      { name: "Eurazeo", domain: "eurazeo.com" },
    ]);
    pages = {
      "https://careers.ardian.com/graduates": "Graduate programme. Analysts in Paris receive a base salary of €65,000 plus bonus.",
      "https://www.tikehau.com/careers": "Join us. We value entrepreneurship.",
      "https://www.eurazeo.com/jobs": "Analyst base salary: €58,000 (Paris, 2026).",
    };
    // Ardian: genuine official evidence. Tikehau: the model "invents" a salary not in the page. Eurazeo: user-confirmed value.
    llmAnswer = (prompt) => {
      if (prompt.includes("Employer: Ardian")) return answer({ value: "€65,000 base", number: 65000, currency: "EUR", confidence: "VERIFIED", evidence: [{ source: 0, excerpt: "receive a base salary of €65,000", value_in_source: "€65,000" }] });
      if (prompt.includes("Employer: Tikehau")) return answer({ value: "€70,000", number: 70000, currency: "EUR", confidence: "VERIFIED", evidence: [{ source: 0, excerpt: "Analysts earn €70,000", value_in_source: "€70,000" }] });
      return answer({ value: "€58,000", number: 58000, currency: "EUR", confidence: "VERIFIED", evidence: [{ source: 0, excerpt: "Analyst base salary: €58,000", value_in_source: "€58,000" }] });
    };
    await db.fieldValue.create({ data: { rowId: rows[2].id, fieldId: salary.id, numberValue: 60000, currency: "EUR", origin: "MANUAL", manuallyConfirmed: true } });

    const plan = await createEnrichPlan(u, ws, { datasetId: ds.id, fields: [salary], rowIds: [], scope: "COLUMN", totalRows: 3 });
    expect(plan.estimatedCredits).toBeGreaterThan(0);
    await expect(launchPlan(u, plan.id, 100000, { providers: testProviders, enqueue: false })).rejects.toThrow(/credits/);
    const job = await launchPlan(u, plan.id, plan.estimatedCredits, { providers: testProviders, enqueue: false });
    await runJob(job.id, testProviders);

    const done = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done.status).toBe("SUCCEEDED");
    expect(done.creditsUsed).toBeLessThanOrEqual(done.budgetCredits);
    const vals = await db.fieldValue.findMany({ where: { fieldId: salary.id }, include: { evidence: { include: { source: true } } } });
    const ardian = vals.find((v) => v.rowId === rows[0].id)!;
    expect(ardian.numberValue).toBe(65000);
    expect(ardian.confidence).toBe("VERIFIED");
    expect(ardian.evidence[0].source.url).toBe("https://careers.ardian.com/graduates");
    expect(ardian.evidence[0].excerpt).toContain("€65,000");

    const tikehau = vals.find((v) => v.rowId === rows[1].id)!;
    expect(tikehau.numberValue).toBeNull();
    expect(tikehau.confidence).toBe("UNKNOWN");
    expect(tikehau.evidence).toHaveLength(0);

    const eurazeo = vals.find((v) => v.rowId === rows[2].id)!;
    expect(eurazeo.numberValue).toBe(60000); // confirmed value kept
    expect(eurazeo.suggestionText).toMatch(/58,000/);
    const sugg = await db.notification.findMany({ where: { userId: u.id, type: "NEW_EVIDENCE" } });
    expect(sugg).toHaveLength(1);

    const usage = await db.usageRecord.aggregate({ where: { jobId: job.id }, _sum: { credits: true } });
    expect(usage._sum.credits).toBe(done.creditsUsed);

    // Export contains the evidence sheet and no formulas
    const { buf } = await exportDataset(ws.id, ds.id);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Funds", "Evidence", "Sources"]);
    expect(JSON.stringify(wb.getWorksheet("Evidence")!.getSheetValues())).toContain("careers.ardian.com");
  });

  it("stops at the approved budget and reports a partial result", async () => {
    const u = await mkUser("budget@test.dev");
    const ws = await mkWorkspace(u, "B");
    const { ds, salary } = await mkDataset(ws, [{ name: "Ardian", domain: "ardian.com" }, { name: "Eurazeo", domain: "eurazeo.com" }]);
    pages = { "https://careers.ardian.com/a": "Analysts receive a base salary of €65,000.", "https://www.eurazeo.com/b": "Analyst base salary: €58,000." };
    llmAnswer = () => answer({ found: false });
    const plan = await createEnrichPlan(u, ws, { datasetId: ds.id, fields: [salary], rowIds: [], scope: "COLUMN", totalRows: 2 });
    const job = await launchPlan(u, plan.id, 4, { providers: testProviders, enqueue: false });
    await runJob(job.id, testProviders);
    const done = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done.status).toBe("PARTIAL");
    expect(done.creditsUsed).toBeLessThanOrEqual(4);
  });

  it("honours cancellation", async () => {
    const u = await mkUser("cancel@test.dev");
    const ws = await mkWorkspace(u, "C");
    const { ds, salary } = await mkDataset(ws, [{ name: "Ardian", domain: "ardian.com" }]);
    const plan = await createEnrichPlan(u, ws, { datasetId: ds.id, fields: [salary], rowIds: [], scope: "COLUMN", totalRows: 1 });
    const job = await launchPlan(u, plan.id, 20, { providers: testProviders, enqueue: false });
    await db.researchJob.update({ where: { id: job.id }, data: { cancelRequested: true } });
    await runJob(job.id, testProviders);
    expect((await db.researchJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("CANCELLED");
  });
});

describe("monitoring and change detection", () => {
  it("detects a verified change, keeps history and notifies once", async () => {
    const u = await mkUser("mon@test.dev");
    const ws = await mkWorkspace(u, "M");
    const { ds, salary, rows } = await mkDataset(ws, [{ name: "Ardian", domain: "ardian.com" }]);
    pages = { "https://careers.ardian.com/pay": "Graduate careers at Ardian. Analysts receive a base salary of €65,000." };
    llmAnswer = (p) => {
      const n = p.includes("€68,000") ? 68000 : 65000;
      return answer({ number: n, value: `€${n}`, currency: "EUR", confidence: "VERIFIED", evidence: [{ source: 0, excerpt: `receive a base salary of €${n.toLocaleString("en-US")}`, value_in_source: null }] });
    };
    const plan = await createEnrichPlan(u, ws, { datasetId: ds.id, fields: [salary], rowIds: [], scope: "COLUMN", totalRows: 1 });
    await runJob((await launchPlan(u, plan.id, 50, { providers: testProviders, enqueue: false })).id, testProviders);

    const rule = await db.monitoringRule.create({ data: { workspaceId: ws.id, datasetId: ds.id, createdById: u.id, name: "Weekly", fieldIds: [salary.id], frequency: "WEEKLY", nextRunAt: new Date(Date.now() - 1000) } });
    // Source changes; page cache must not hide it
    pages["https://careers.ardian.com/pay"] = "Graduate careers at Ardian. Analysts receive a base salary of €68,000.";
    await db.pageCache.deleteMany();
    const jobs = await runDueMonitoringRules({ providers: testProviders, inline: true });
    expect(jobs).toHaveLength(1);
    const fv = await db.fieldValue.findUniqueOrThrow({ where: { rowId_fieldId: { rowId: rows[0].id, fieldId: salary.id } }, include: { history: { orderBy: { createdAt: "asc" } } } });
    expect(fv.numberValue).toBe(68000);
    const last = fv.history.at(-1)!;
    expect(last.previousValue).toBe("€65,000");
    expect(last.newValue).toBe("€68,000");
    expect(last.reason).toMatch(/monitoring/i);
    const notes = await db.notification.findMany({ where: { userId: u.id, type: "FIELD_CHANGED" } });
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain("€65,000 → €68,000");
    // Rule rescheduled ~7 days ahead
    const r2 = await db.monitoringRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(r2.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86400_000);
    // Duplicate alerts are suppressed
    expect(await notify({ userId: u.id, type: "X", title: "t", dedupeKey: "same" })).toBe(true);
    expect(await notify({ userId: u.id, type: "X", title: "t", dedupeKey: "same" })).toBe(false);
  });
});

describe("employer online verification job", () => {
  it("marks real employers verified, fills their website, and flags unknown ones", async () => {
    const { createVerifyPlan } = await import("@/server/research/plan");
    const u = await mkUser("verify@test.dev");
    const ws = await mkWorkspace(u, "V");
    const ds = await db.dataset.create({ data: { workspaceId: ws.id, name: "List" } });
    const name = await db.fieldDefinition.create({ data: { datasetId: ds.id, key: "company", name: "Company", type: "TEXT", isPrimary: true, coreBinding: "company.name", position: 0 } });
    const site = await db.fieldDefinition.create({ data: { datasetId: ds.id, key: "website", name: "Website", type: "URL", coreBinding: "company.website", position: 1 } });
    for (const [i, n] of ["Ardian", "Zorblax Quantum"].entries()) {
      const c = await db.company.create({ data: { workspaceId: ws.id, name: n, normalizedName: n.toLowerCase() } });
      const r = await db.datasetRow.create({ data: { datasetId: ds.id, companyId: c.id, position: i } });
      await db.fieldValue.create({ data: { rowId: r.id, fieldId: name.id, textValue: n } });
    }
    pages = { "https://www.ardian.com/": "Ardian, world-leading private investment house." };
    const plan = await createVerifyPlan(u, ws, { datasetId: ds.id, rowIds: [] });
    expect(plan.estimatedCredits).toBe(2);
    const job = await launchPlan(u, plan.id, plan.estimatedCredits, { providers: { ...testProviders, llm: null }, enqueue: false });
    await runJob(job.id, { ...testProviders, llm: null });
    const done = await db.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done.status).toBe("SUCCEEDED");
    const ardian = await db.company.findFirstOrThrow({ where: { workspaceId: ws.id, name: "Ardian" } });
    expect(ardian.verifyStatus).toBe("VERIFIED");
    expect(ardian.website).toBe("https://www.ardian.com");
    const cell = await db.fieldValue.findFirst({ where: { fieldId: site.id, row: { companyId: ardian.id } } });
    expect(cell?.textValue).toBe("https://www.ardian.com");
    const z = await db.company.findFirstOrThrow({ where: { workspaceId: ws.id, name: "Zorblax Quantum" } });
    expect(z.verifyStatus).toBe("NOT_FOUND");
    expect(await db.notification.count({ where: { userId: u.id, type: "COMPANY_NOT_FOUND" } })).toBe(1);
  });
});
