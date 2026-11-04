import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook, safeCell } from "@/server/export";
import { assertPublicUrl, isBlockedForFetching, parseRobots, robotsAllows } from "@/server/providers/fetcher";
import { validateUpload } from "@/server/files";

describe("export formula-injection protection", () => {
  it("escapes dangerous leading characters", () => {
    expect(safeCell("=HYPERLINK(\"http://evil\")")).toBe("'=HYPERLINK(\"http://evil\")");
    expect(safeCell("+33 1 23")).toBe("'+33 1 23");
    expect(safeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(safeCell("Normal")).toBe("Normal");
    expect(safeCell(42)).toBe(42);
  });
  it("produces a workbook without formulas", async () => {
    const buf = await buildWorkbook([{ name: "T", columns: [{ header: "=cmd" }], rows: [["=1+1"], ["-2+3"]] }]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    ws.eachRow((row) => row.eachCell((c) => expect(c.formula).toBeUndefined()));
    expect(ws.getCell("A2").value).toBe("'=1+1");
  });
});

describe("fetch safety", () => {
  it("blocks private networks (SSRF)", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/admin")).rejects.toThrow();
    await expect(assertPublicUrl("http://10.0.0.5/")).rejects.toThrow();
    await expect(assertPublicUrl("http://localhost:3000/")).rejects.toThrow();
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(assertPublicUrl("http://user:pw@example.com/")).rejects.toThrow();
  });
  it("never fetches platforms that forbid it", () => {
    expect(isBlockedForFetching("https://www.linkedin.com/in/jane")).toBe(true);
    expect(isBlockedForFetching("https://careers.ardian.com")).toBe(false);
  });
  it("respects robots.txt", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: Googlebot\nDisallow: /");
    expect(robotsAllows(rules, "/careers")).toBe(true);
    expect(robotsAllows(rules, "/private/x")).toBe(false);
    expect(robotsAllows(rules, "/private/ok/1")).toBe(true);
  });
});

describe("upload validation", () => {
  it("checks magic bytes, not just extensions", () => {
    expect(() => validateUpload("cv.pdf", Buffer.from("PK\x03\x04rest"), "CV")).toThrow();
    expect(validateUpload("cv.pdf", Buffer.from("%PDF-1.7 ..."), "CV")).toBe(".pdf");
    expect(() => validateUpload("data.exe", Buffer.from("MZ"), "SPREADSHEET")).toThrow();
    expect(() => validateUpload("x.csv", Buffer.from([0x41, 0x00, 0x42]), "SPREADSHEET")).toThrow();
    expect(() => validateUpload("big.csv", Buffer.alloc(11 * 1024 * 1024, 65), "SPREADSHEET")).toThrow();
  });
});
