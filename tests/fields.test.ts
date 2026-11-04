import { describe, expect, it } from "vitest";
import { inferType, parseValue, parseNumberLoose, parseDateLoose, normalizeName, displayValue } from "@/lib/fields";
import { evaluateFormula } from "@/lib/formula";

describe("type inference", () => {
  it("detects finance columns", () => {
    expect(inferType(["€55,000", "€60,000", "€48 000"], "Analyst Salary")).toBe("CURRENCY");
    expect(inferType(["Yes", "No", "Oui", "No"], "Graduate Programme")).toBe("BOOLEAN");
    expect(inferType(["https://ardian.com", "www.tikehau.com", "https://axa-im.com"], "Website")).toBe("URL");
  });
  it("detects tech columns", () => {
    expect(inferType(["2027-01-15", "2027-02-01", "15/03/2027"], "Deadline")).toBe("DATE");
    expect(inferType(["jane@acme.io", "bob@corp.com"], "Contact")).toBe("EMAIL");
    expect(inferType(["Remote", "Hybrid", "Onsite", "Remote", "Hybrid", "Onsite", "Remote", "Hybrid", "Remote"], "Remote Work")).toBe("SINGLE_SELECT");
    expect(inferType([55000, 61000, 70000], "Pay")).toBe("CURRENCY");
    expect(inferType([3, 5, 8], "Team size")).toBe("NUMBER");
  });
  it("keeps free text as text", () => {
    expect(inferType(["Ardian", "Tikehau Capital", "AXA IM Alts"], "Company")).toBe("TEXT");
  });
});

describe("value parsing", () => {
  it("parses European and suffixed numbers", () => {
    expect(parseNumberLoose("1.234,56")).toBeCloseTo(1234.56);
    expect(parseNumberLoose("55k")).toBe(55000);
    expect(parseNumberLoose("€ 60 000")).toBe(60000);
    expect(parseNumberLoose("abc")).toBeNull();
  });
  it("parses dates day-first and ISO", () => {
    expect(parseDateLoose("15/03/2027")?.toISOString().slice(0, 10)).toBe("2027-03-15");
    expect(parseDateLoose("2027-06-30")?.toISOString().slice(0, 10)).toBe("2027-06-30");
    expect(parseDateLoose("31/02/2027")).toBeNull();
  });
  it("reports invalid values instead of coercing", () => {
    const r = parseValue("not a number", "NUMBER");
    expect(r.ok).toBe(false);
    const c = parseValue("£45,000", "CURRENCY");
    expect(c.ok && c.value.currency).toBe("GBP");
    const p = parseValue("12%", "PERCENT");
    expect(p.ok && p.value.numberValue).toBeCloseTo(0.12);
    expect(parseValue("ftp://x", "URL").ok).toBe(false);
  });
  it("normalises company names for deduplication", () => {
    expect(normalizeName("Tikehau Capital SA")).toBe(normalizeName("tikehau capital"));
    expect(normalizeName("Société Générale")).toBe("societe generale");
  });
  it("displays typed values", () => {
    expect(displayValue({ numberValue: 0.25 }, "PERCENT")).toBe("25%");
    expect(displayValue({ boolValue: true }, "BOOLEAN")).toBe("Yes");
  });
});

describe("formulas", () => {
  const vals: Record<string, number | null> = { Base: 50000, Bonus: 10000, Missing: null };
  const r = (k: string) => vals[k] ?? null;
  it("evaluates safely", () => {
    expect(evaluateFormula("{Base} + {Bonus}", r)).toBe(60000);
    expect(evaluateFormula("ROUND({Bonus} / {Base} * 100, 1)", r)).toBe(20);
    expect(evaluateFormula("IF({Base} > 40000, 1, 0)", r)).toBe(1);
  });
  it("propagates missing data instead of inventing it", () => {
    expect(evaluateFormula("{Base} + {Missing}", r)).toBeNull();
  });
  it("rejects code", () => {
    expect(() => evaluateFormula("process.exit()", r)).toThrow();
    expect(() => evaluateFormula("{Base}; alert(1)", r)).toThrow();
  });
});

describe("messy real-world columns", () => {
  it("infers currency for a mostly-numeric salary column and leaves outliers to validation", () => {
    expect(inferType(["€65,000", "€60,000", "62k", "not disclosed"], "Analyst Salary")).toBe("CURRENCY");
    expect(inferType(["12", "n/a", "7", "x"], "Team")).toBe("TEXT");
  });
});
