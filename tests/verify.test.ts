import { describe, expect, it } from "vitest";
import { decide, excerptInSource, focusText, numberSupported } from "@/server/research/verify";
import { sourceTier } from "@/server/research/sources";

const official = { url: "https://careers.ardian.com/graduates", title: "Graduates", tier: 1, text: "Our Graduate Programme in Paris opens on 1 September 2026. Analysts receive a base salary of €65,000 plus a performance bonus." };
const press = { url: "https://news.efinancialcareers.com/x", title: "Pay", tier: 3, text: "Sources say first-year analysts at Ardian earn around €70,000 in base salary." };

describe("anti-fabrication gate", () => {
  it("accepts verbatim excerpts, tolerant to whitespace and quotes", () => {
    expect(excerptInSource("base salary of  €65,000", official.text)).toBe(true);
    expect(excerptInSource("Our Graduate Programme ... opens on 1 September 2026", official.text)).toBe(true);
    expect(excerptInSource("base salary of €80,000", official.text)).toBe(false);
    expect(excerptInSource("salary", official.text)).toBe(false); // too short
  });
  it("checks numbers appear in the excerpt", () => {
    expect(numberSupported(65000, "a base salary of €65,000")).toBe(true);
    expect(numberSupported(65000, "around 65k")).toBe(true);
    expect(numberSupported(90000, "a base salary of €65,000")).toBe(false);
  });
  it("keeps VERIFIED only for official sources", () => {
    const d = decide({ claimed: "VERIFIED", found: true, numericValue: 65000, evidence: [{ sourceIndex: 0, excerpt: "base salary of €65,000", valueInSource: "€65,000" }], sources: [official] });
    expect(d.confidence).toBe("VERIFIED");
    const p = decide({ claimed: "VERIFIED", found: true, numericValue: 70000, evidence: [{ sourceIndex: 0, excerpt: "earn around €70,000 in base salary", valueInSource: "€70,000" }], sources: [press] });
    expect(p.confidence).toBe("REPORTED");
  });
  it("discards invented excerpts and values", () => {
    const d = decide({ claimed: "VERIFIED", found: true, numericValue: 90000, evidence: [{ sourceIndex: 0, excerpt: "analysts are paid €90,000", valueInSource: null }], sources: [official] });
    expect(d.confidence).toBe("UNKNOWN");
    expect(d.validEvidence).toHaveLength(0);
    const wrongValue = decide({ claimed: "REPORTED", found: true, numericValue: 90000, evidence: [{ sourceIndex: 0, excerpt: "base salary of €65,000", valueInSource: null }], sources: [official] });
    expect(wrongValue.confidence).toBe("UNKNOWN");
    const badIndex = decide({ claimed: "REPORTED", found: true, evidence: [{ sourceIndex: 7, excerpt: "base salary of €65,000" }], sources: [official] });
    expect(badIndex.confidence).toBe("UNKNOWN");
  });
  it("flags conflicting sources", () => {
    const d = decide({
      claimed: "REPORTED", found: true, numericValue: 65000,
      evidence: [{ sourceIndex: 0, excerpt: "base salary of €65,000", valueInSource: "€65,000" }, { sourceIndex: 1, excerpt: "earn around €70,000 in base salary", valueInSource: "€70,000" }],
      sources: [official, press],
    });
    expect(d.confidence).toBe("CONFLICTING");
  });
  it("ranks sources by tier", () => {
    expect(sourceTier("https://careers.ardian.com/x", ["ardian.com"])).toBe(1);
    expect(sourceTier("https://boards.greenhouse.io/acme/jobs/1", ["acme.com"])).toBe(2);
    expect(sourceTier("https://www.ft.com/content/1", [])).toBe(3);
    expect(sourceTier("https://www.glassdoor.fr/Salaires", [])).toBe(4);
    expect(sourceTier("https://randomblog.net", [])).toBe(5);
  });
  it("focuses long text on relevant passages", () => {
    const text = Array.from({ length: 500 }, (_, i) => (i === 321 ? "The analyst salary in Paris is €60,000." : `Filler paragraph ${i} about nothing in particular.`)).join("\n");
    expect(focusText(text, ["salary", "analyst"], 2000)).toContain("€60,000");
  });
});
