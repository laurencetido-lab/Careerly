import * as XLSX from "@e965/xlsx";
import { CAREER_HEADER, EMPLOYER_HEADER, inferType, isBlank, normalizeName, orgNameError, parseValue, type FieldTypeName } from "@/lib/fields";

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
  recognisedHeaders: string[];
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
  const quality = (c: ColumnPreview) => {
    const vals = data.map((r) => r[c.index] ?? null).filter((v) => !isBlank(v));
    const ok = vals.filter((v) => !orgNameError(v)).length;
    const distinct = new Set(vals.map((v) => String(v).trim().toLowerCase())).size;
    return { valid: vals.length ? ok / vals.length : 0, distinct: vals.length ? distinct / vals.length : 0, filled: vals.length / Math.max(1, data.length) };
  };
  const plausible = (c: ColumnPreview) => { const q = quality(c); return q.valid >= 0.8 && q.distinct >= 0.7 && q.filled >= 0.5; };
  // Only suggest an employer column when its header says so or its values really look like organisation names
  const primary =
    columns.find((c) => (PRIMARY_HINTS.test(c.header) || EMPLOYER_HEADER.test(c.header)) && quality(c).valid >= 0.5) ??
    columns.find((c) => PRIMARY_LOOSE.test(c.header) && c.inferredType === "TEXT" && plausible(c)) ??
    columns.find((c) => c.inferredType === "TEXT" && plausible(c));
  if (primary) primary.suggestedBinding = "company.name";
  const site = columns.find((c) => c !== primary && (c.inferredType === "URL" || WEBSITE_HINTS.test(c.header)));
  if (site) site.suggestedBinding = "company.website";
  return {
    sheetName: sheet.name,
    headerRow,
    rowCount: data.length,
    recognisedHeaders: columns.filter((c) => CAREER_HEADER.test(c.header)).map((c) => c.header),
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

export interface ImportCheck {
  issues: ValidationIssue[];
  duplicates: { row: number; firstRow: number; value: string }[];
  invalidNames: { row: number; value: string; reason: string }[];
  totalRows: number;
  truncated: boolean;
  recognisedHeaders: string[];
  /** Set when the file must not be imported at all. */
  blocked: string | null;
  /** Set when the user must explicitly confirm the file is a list of employers. */
  needsConfirmation: string | null;
}

/**
 * Validate all data rows against the chosen mapping. Detects duplicates and, crucially, refuses files
 * that are not lists of employers: names that are numbers, dates, emails, links or sentences are rejected,
 * and the whole import is blocked when more than 30% of names are not plausible organisation names.
 */
export function validateImport(sheet: Sheet, headerRow: number, mapping: MappingColumn[]): ImportCheck {
  const data = sheet.rows.slice(headerRow + 1).slice(0, MAX_ROWS);
  const issues: ValidationIssue[] = [];
  const primary = mapping.find((m) => m.include && m.binding === "company.name");
  const seen = new Map<string, number>();
  const duplicates: ImportCheck["duplicates"] = [];
  const invalidNames: ImportCheck["invalidNames"] = [];
  let names = 0;
  data.forEach((r, i) => {
    const rowNum = headerRow + 2 + i; // 1-based spreadsheet row number
    if (primary) {
      const raw = r[primary.index] ?? null;
      if (isBlank(raw)) return;
      names++;
      const why = orgNameError(raw);
      if (why) {
        invalidNames.push({ row: rowNum, value: cellToString(raw).slice(0, 80), reason: why });
        return;
      }
      const key = normalizeName(cellToString(raw));
      if (seen.has(key)) duplicates.push({ row: rowNum, firstRow: seen.get(key)!, value: cellToString(raw) });
      else seen.set(key, rowNum);
    }
    for (const m of mapping) {
      if (!m.include || m === primary) continue;
      const res = parseValue(r[m.index] ?? null, m.type);
      if (!res.ok) issues.push({ row: rowNum, column: m.name, message: res.error });
    }
  });
  const recognisedHeaders = mapping.filter((m) => m.include && CAREER_HEADER.test(m.name)).map((m) => m.name);
  const badShare = names ? invalidNames.length / names : 1;
  const unique = seen.size / Math.max(1, names - invalidNames.length);
  const blocked = !data.length
    ? "The file contains no data rows."
    : !primary
      ? "Choose the column that contains employer names."
      : !names
        ? `The column "${primary.name}" is empty.`
        : badShare > 0.3
          ? `${Math.round(badShare * 100)}% of the values in "${primary.name}" are not company names (numbers, dates, emails, links or sentences). This does not look like a list of employers, or the wrong column is selected.`
          : null;
  const needsConfirmation = blocked
    ? null
    : !recognisedHeaders.length
      ? "No usual column (Company, Role, City, Salary, Website…) was recognised in this file."
      : unique < 0.5
        ? `The same values repeat very often in "${primary!.name}", which is unusual for a list of employers.`
        : null;
  return { issues, duplicates, invalidNames, totalRows: data.length, truncated: sheet.rows.length - headerRow - 1 > MAX_ROWS, recognisedHeaders, blocked, needsConfirmation };
}
