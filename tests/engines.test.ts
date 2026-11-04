import { describe, expect, it } from "vitest";
import { scoreRows, type ScoreRowInput } from "@/lib/scoring";
import { scoreContact } from "@/lib/contactScore";
import { parseProfileResultTitle } from "@/server/research/discover";
import { templateMessages, type MessageFacts } from "@/server/messages";
import { heuristicProfile } from "@/server/cv";
import { parseWorkbook, previewSheet, validateImport } from "@/server/spreadsheet";

describe("scoring", () => {
  const crit = [
    { fieldId: "pay", label: "Pay", weight: 60, direction: "HIGHER" as const, constraintType: "NONE" as const },
    { fieldId: "visa", label: "Visa", weight: 40, direction: "TRUE" as const, constraintType: "EQUALS" as const, constraintValue: "Yes" },
  ];
  const rows: ScoreRowInput[] = [
    { id: "a", label: "A", values: { pay: { num: 70000, display: "70000" }, visa: { num: 1, display: "Yes" } } },
    { id: "b", label: "B", values: { pay: { num: 90000, display: "90000" }, visa: { num: 0, display: "No" } } },
    { id: "c", label: "C", values: { pay: { num: 50000, display: "50000" } } },
  ];
  it("never lets an attractive score override a hard constraint", () => {
    const r = scoreRows(rows, crit);
    expect(r.find((x) => x.id === "b")!.excluded).toBe(true);
    expect(r[0].id).toBe("a");
  });
  it("marks rankings with missing data as provisional, without inventing values", () => {
    const c = scoreRows(rows, crit).find((x) => x.id === "c")!;
    expect(c.provisional).toBe(true);
    expect(c.completeness).toBeCloseTo(0.6);
    expect(c.breakdown.find((b) => b.fieldId === "visa")!.contribution).toBeNull();
  });
});

describe("contacts", () => {
  it("parses public search-result titles", () => {
    expect(parseProfileResultTitle("Jane Doe - Investment Analyst - Ardian | LinkedIn")).toEqual({ name: "Jane Doe", title: "Investment Analyst", company: "Ardian" });
    expect(parseProfileResultTitle("Top 10 analysts in Paris")).toBeNull();
  });
  it("explains relevance without probabilities", () => {
    const s = scoreContact({ title: "Investment Analyst", location: "Paris, France" }, { roles: ["Investment Analyst"], locations: ["Paris"] });
    expect(s.score).toBeGreaterThan(50);
    expect(s.reasons.join(" ")).toMatch(/Role matches/);
    expect(s.reasons.join(" ")).not.toMatch(/%|probab/i);
  });
});

describe("messages", () => {
  const facts: MessageFacts = { senderName: "Léa Martin", senderHeadline: null, education: [], recentExperience: [], objective: "Investment analyst role in Paris", contactName: "Jane Doe", contactTitle: "Analyst", company: "Ardian", sharedBackground: null, lastInteraction: null, purpose: "CONNECTION_REQUEST", platform: "LINKEDIN", language: "en", usesProfile: false };
  it("never claims an unverified shared background and respects LinkedIn limits", () => {
    const m = templateMessages(facts);
    expect(m.professional.length).toBeLessThanOrEqual(300);
    expect(m.professional).not.toMatch(/both studied|alumni/i);
    const withAlumni = templateMessages({ ...facts, sharedBackground: "Both studied at ESSEC (confirmed by the user)" });
    expect(withAlumni.professional).toMatch(/ESSEC/);
  });
  it("supports French", () => {
    expect(templateMessages({ ...facts, language: "fr", purpose: "CALL_REQUEST" }).professional).toMatch(/Bonjour/);
  });
});

describe("CV local parsing", () => {
  it("proposes only what is in the text", () => {
    const p = heuristicProfile("Léa Martin\nMSc Finance candidate\nEducation\nESSEC Business School, MSc Finance 2025 - 2027\nExperience\nM&A Intern at Rothschild 2024 - 2024\nSkills: Excel, Python, Valuation\nLanguages: French, English");
    expect(p.education[0].institution).toMatch(/ESSEC/);
    expect(p.skills).toEqual(["Excel", "Python", "Valuation"]);
    expect(p.languages).toContain("English");
    expect(p.graduationDate).toBe("2027");
    expect(p.achievements).toEqual([]);
  });
});

describe("import engine", () => {
  it("handles any columns, detects the employer column and duplicates", () => {
    const csv = "My target list,,\nEmployer,Role,Visa Sponsorship,Remote Work,Deadline\nAcme AI,ML Engineer,Yes,Remote,2027-01-15\nBeta Labs,Data Engineer,No,Hybrid,31/01/2027\nAcme AI,Research Engineer,Yes,Remote,2027-02-01\n";
    const [sheet] = parseWorkbook(Buffer.from(csv));
    const prev = previewSheet(sheet);
    expect(prev.headerRow).toBe(1);
    const byHeader = Object.fromEntries(prev.columns.map((c) => [c.header, c]));
    expect(byHeader["Employer"].suggestedBinding).toBe("company.name");
    expect(byHeader["Visa Sponsorship"].inferredType).toBe("BOOLEAN");
    expect(byHeader["Deadline"].inferredType).toBe("DATE");
    const mapping = prev.columns.map((c) => ({ index: c.index, name: c.header, type: c.inferredType, include: true, binding: c.suggestedBinding }));
    const v = validateImport(sheet, prev.headerRow, mapping);
    expect(v.duplicates).toHaveLength(1);
    expect(v.issues).toHaveLength(0);
  });
  it("never evaluates formulas from uploaded files", () => {
    const [sheet] = parseWorkbook(Buffer.from('Company,Note\nAcme,"=HYPERLINK(""http://evil"")"\n'));
    expect(String(sheet.rows[1][1])).toContain("HYPERLINK");
  });
});

describe("import guardrails: only lists of employers", () => {
  const run = (csv: string) => {
    const [sheet] = parseWorkbook(Buffer.from(csv));
    const prev = previewSheet(sheet);
    const mapping = prev.columns.map((c) => ({ index: c.index, name: c.header, type: c.inferredType, include: true, binding: c.suggestedBinding }));
    return { prev, check: validateImport(sheet, prev.headerRow, mapping), sheet, mapping };
  };
  it("refuses files with no plausible employer column", () => {
    const numbers = run("Date,Amount,Code\n2024-01-02,120,4455\n2024-01-03,98,4456\n");
    expect(numbers.prev.columns.some((c) => c.suggestedBinding === "company.name")).toBe(false);
    expect(numbers.check.blocked).toMatch(/employer/i);
    const notes = run("Notes\nI must call the dentist tomorrow morning before ten.\nBuy a present for Paul's birthday this week.\n");
    expect(notes.check.blocked).toBeTruthy();
  });
  it("blocks when a forced name column holds emails, dates or sentences", () => {
    const { sheet, prev } = run("Email,Signed up\njean@example.com,yes\nmarie@example.com,no\nzoe@example.com,yes\n");
    const forced = prev.columns.map((c, i) => ({ index: c.index, name: c.header, type: c.inferredType, include: true, binding: i === 0 ? ("company.name" as const) : null }));
    const c = validateImport(sheet, prev.headerRow, forced);
    expect(c.blocked).toMatch(/not company names/);
    expect(c.invalidNames[0].reason).toMatch(/email/);
  });
  it("asks for confirmation when nothing career-related is recognised", () => {
    const shopping = run("Product,Quantity,Price\nApples,3,2.5\nMilk,2,1.2\nBread,1,1.1\nPasta,4,0.9\n");
    expect(shopping.check.blocked).toBeNull();
    expect(shopping.check.needsConfirmation).toMatch(/No usual column/);
  });
  it("accepts real employer lists and excludes the odd bad row", () => {
    const ok = run("Company,City\nArdian,Paris\nTikehau Capital,Paris\n12345,Paris\nEurazeo,Paris\nWendel,Paris\n");
    expect(ok.check.blocked).toBeNull();
    expect(ok.check.needsConfirmation).toBeNull();
    expect(ok.check.invalidNames).toHaveLength(1);
  });
});
