import ExcelJS from "exceljs";

/** Neutralise spreadsheet formula injection (CSV/Excel injection). */
export function safeCell(v: unknown): string | number | boolean | Date | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean" || v instanceof Date) return v;
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export interface ExportSheet {
  name: string;
  columns: { header: string; width?: number }[];
  rows: unknown[][];
}

export async function buildWorkbook(sheets: ExportSheet[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Careerly";
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet");
    ws.columns = s.columns.map((c) => ({ header: String(safeCell(c.header) ?? ""), width: c.width ?? 22 }));
    for (const r of s.rows) ws.addRow(r.map(safeCell));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
