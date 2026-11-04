import * as XLSX from "@e965/xlsx";
import { inferType, isBlank, normalizeName, parseValue, type FieldTypeName } from "@/lib/fields";

export type Cell = string | number | boolean | Date | null;
export interface Sheet { name: string; rows: Cell[][] }

const MAX_ROWS = 5000;
const MAX_COLS = 100;

/**
 * Parse XLSX / XLS / CSV into plain values. Formulas are never evaluated or kept
 * (cached values only), HTML and rich text are dropped.
 */
export function parseWorkbook(buf: Buffer): Sheet[] {
  const wb = XLSX.read(buf, { type: "buffer", cellFormula: false, cellHTML: false, cellDates: true, dense: true, sheetRows: MAX_ROWS + 50 });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: false }) as Cell[][];
    return {
      name,
      rows: rows.slice(0, MAX_ROWS + 50).map((r) => r.slice(0, MAX_COLS).map((c) => (typeof c === "string" ? c.replace(/\u0000/g, "") : c))),
    };
  }).filter((s) => s.rows.length > 0);
}

/** First row (in the first 10) whose cells are mostly non-empty short strings and is followed by data. */
export function detectHeaderRow(rows: Cell[][]): number {
  for (let i = 0; i < Math.min(10, rows.length - 1); i++) {
    const r = rows[i];
    const filled = r.filter((c) => !isBlank(c));
    if (filled.length < 1) continue;
    const textual = filled.filter((c) => typeof c === "string" && c.length < 80).length;
    const width = Math.max(...rows.slice(i + 1, i + 6).map((x) => x.filter((c) => !isBlank(c)).length), 0);
    if (textual / filled.length >= 0.8 && filled.length >= Math.max(1, Math.floor(width * 0.6))) return i;
  }
  return 0;
}

const PRIMARY_HINTS = /^(company|companies|employer|entreprise|société|societe|firm|fund|funds|organisation|organization|name|nom|bank|banque|cabinet|investor)( name)?$/i;
const PRIMARY_LOOSE = /(company|employer|entreprise|société|societe|firm|fund|organi[sz]ation|bank|banque|name|nom)/i;
const WEBSITE_HINTS = /(website|site web|site|url|domain|homepage|careers? page)/i;

export interface ColumnPreview {
  index: number;
  header: string;
  inferredType: FieldTypeName;
  samples: string[];
  emptyCount: number;
  suggestedBinding: "company.name" | "company.website" | null;
}

export interface SheetPreview {
  sheetName: string;
  headerRow: number;
  rowCount: number;
  columns: ColumnPreview[];
  sampleRows: string[][];
}

export function previewSheet(sheet: Sheet, headerRow = detectHeaderRow(sheet.rows)): SheetPreview {
  const header = sheet.rows[headerRow] ?? [];
  const data = sheet.rows.slice(headerRow + 1);
  const width = Math.max(header.length, ...data.slice(0, 50).map((r) => r.length));
  const seen = new Map<string, number>();
  const columns: ColumnPreview[] = [];
  for (let c = 0; c < width; c++) {
    let h = String(header[c] ?? "").trim() || `Column ${c + 1}`;
    const n = (seen.get(h.toLowerCase()) ?? 0) + 1;
    seen.set(h.toLowerCase(), n);
    if (n > 1) h = `${h} (${n})`;
    const colVals = data.map((r) => r[c] ?? null);
    if (colVals.every(isBlank) && !header[c]) continue;
    columns.push({
      index: c,
      header: h,
      inferredType: inferType(colVals, h),
      samples: colVals.filter((v) => !isBlank(v)).slice(0, 3).map(cellToString),
      emptyCount: colVals.filter(isBlank).length,
      suggestedBinding: null,
    });
  }
  const primary = columns.find((c) => PRIMARY_HINTS.test(c.header)) ?? columns.find((c) => PRIMARY_LOOSE.test(c.header) && c.inferredType === "TEXT") ?? columns.find((c) => c.inferredType === "TEXT");
  if (primary) primary.suggestedBinding = "company.name";
  const site = columns.find((c) => c !== primary && (c.inferredType === "URL" || WEBSITE_HINTS.test(c.header)));
  if (site) site.suggestedBinding = "company.website";
  return {
    sheetName: sheet.name,
    headerRow,
    rowCount: data.length,
    columns,
    sampleRows: data.slice(0, 8).map((r) => columns.map((c) => cellToString(r[c.index] ?? null))),
  };
}

export function cellToString(c: Cell): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c);
}

export interface MappingColumn {
  index: number;
  name: string;
  type: FieldTypeName;
  include: boolean;
  binding: "company.name" | "company.website" | null;
}

export interface ValidationIssue { row: number; column: string; message: string }

/** Validate all data rows against the chosen mapping; detect duplicates on the primary column. */
export function validateImport(sheet: Sheet, headerRow: number, mapping: MappingColumn[]) {
  const data = sheet.rows.slice(headerRow + 1).slice(0, MAX_ROWS);
  const issues: ValidationIssue[] = [];
  const primary = mapping.find((m) => m.include && m.binding === "company.name");
  const seen = new Map<string, number>();
  const duplicates: { row: number; firstRow: number; value: string }[] = [];
  data.forEach((r, i) => {
    const rowNum = headerRow + 2 + i; // 1-based spreadsheet row number
    for (const m of mapping) {
      if (!m.include) continue;
      const res = parseValue(r[m.index] ?? null, m.type);
      if (!res.ok) issues.push({ row: rowNum, column: m.name, message: res.error });
    }
    if (primary) {
      const key = normalizeName(cellToString(r[primary.index] ?? null));
      if (!key) issues.push({ row: rowNum, column: primary.name, message: "Name is empty" });
      else if (seen.has(key)) duplicates.push({ row: rowNum, firstRow: seen.get(key)!, value: cellToString(r[primary.index]) });
      else seen.set(key, rowNum);
    }
  });
  return { issues, duplicates, totalRows: data.length, truncated: sheet.rows.length - headerRow - 1 > MAX_ROWS };
}
