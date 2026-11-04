/**
 * Field type system shared by import, inline editing, research and export.
 * Pure functions only, so it can be unit-tested and used on client and server.
 */
export type FieldTypeName =
  | "TEXT" | "LONG_TEXT" | "NUMBER" | "CURRENCY" | "PERCENT" | "DATE" | "BOOLEAN"
  | "SINGLE_SELECT" | "MULTI_SELECT" | "URL" | "EMAIL" | "FORMULA" | "AI_RESEARCH" | "SOURCE_REF" | "RELATION";

export const FIELD_TYPE_LABELS: Record<FieldTypeName, string> = {
  TEXT: "Text",
  LONG_TEXT: "Long text",
  NUMBER: "Number",
  CURRENCY: "Currency",
  PERCENT: "Percentage",
  DATE: "Date",
  BOOLEAN: "Yes / No",
  SINGLE_SELECT: "Single select",
  MULTI_SELECT: "Multi-select",
  URL: "URL",
  EMAIL: "Email",
  FORMULA: "Formula",
  AI_RESEARCH: "AI-researched",
  SOURCE_REF: "Source reference",
  RELATION: "Relationship",
};

/** Types a user can pick when creating a field manually. */
export const CREATABLE_TYPES: FieldTypeName[] = [
  "TEXT", "LONG_TEXT", "NUMBER", "CURRENCY", "PERCENT", "DATE", "BOOLEAN",
  "SINGLE_SELECT", "MULTI_SELECT", "URL", "EMAIL", "FORMULA", "AI_RESEARCH", "SOURCE_REF",
];

/** Types a researched value can have. */
export const RESEARCH_VALUE_TYPES: FieldTypeName[] = ["TEXT", "LONG_TEXT", "NUMBER", "CURRENCY", "PERCENT", "DATE", "BOOLEAN", "URL"];

export interface TypedValue {
  textValue: string | null;
  numberValue: number | null;
  dateValue: Date | null;
  boolValue: boolean | null;
  listValue: string[];
  currency: string | null;
}

export const EMPTY_VALUE: TypedValue = {
  textValue: null, numberValue: null, dateValue: null, boolValue: null, listValue: [], currency: null,
};

const CURRENCY_SYMBOLS: Record<string, string> = { "€": "EUR", "$": "USD", "£": "GBP", "¥": "JPY", "CHF": "CHF", "₹": "INR" };
const CURRENCY_CODE = /\b(EUR|USD|GBP|CHF|JPY|CAD|AUD|SEK|NOK|DKK|SGD|HKD|INR|CNY|PLN)\b/i;

const TRUE_WORDS = new Set(["yes", "y", "true", "oui", "vrai", "1", "x", "✓", "✔"]);
const FALSE_WORDS = new Set(["no", "n", "false", "non", "faux", "0"]);

export function isBlank(v: unknown) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export function parseNumberLoose(raw: string): number | null {
  let s = raw.trim().replace(/[\s  ]/g, "");
  s = s.replace(/[€$£¥₹%]/g, "").replace(CURRENCY_CODE, "");
  let mult = 1;
  const suffix = s.match(/([kKmM])$/);
  if (suffix) {
    mult = suffix[1].toLowerCase() === "k" ? 1_000 : 1_000_000;
    s = s.slice(0, -1);
  }
  if (!s) return null;
  // European format 1.234,56 or 1234,56
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s) * mult;
  return Number.isFinite(n) ? n : null;
}

export function detectCurrency(raw: string): string | null {
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) if (raw.includes(sym)) return code;
  const m = raw.match(CURRENCY_CODE);
  return m ? m[1].toUpperCase() : null;
}

export function parseDateLoose(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number") {
    // Excel serial date
    if (raw > 20000 && raw < 80000) return new Date(Math.round((raw - 25569) * 86400 * 1000));
    return null;
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return utc(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (m) {
    // Default to day-first (EU), unless the first part cannot be a day-first month.
    const a = +m[1], b = +m[2];
    if (b > 12 && a <= 12) return utc(+m[3], a, b);
    return utc(+m[3], b, a);
  }
  if (/^[A-Za-zéû]{3,}\.? \d{1,2},? \d{4}$|^\d{1,2} [A-Za-zéû]{3,}\.? \d{4}$/.test(s)) {
    const d = new Date(s + " UTC");
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function utc(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 ? date : null;
}

export function isUrl(s: string) {
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    return /^https?:$/.test(u.protocol) && /\.[a-z]{2,}$/i.test(u.hostname) && !/\s/.test(s);
  } catch {
    return false;
  }
}

export function normalizeUrl(s: string) {
  const t = s.trim();
  return t.startsWith("http://") || t.startsWith("https://") ? t : `https://${t}`;
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s.trim());

/** Infer the best field type for a column of sample values. */
export function inferType(samples: unknown[], header = ""): FieldTypeName {
  const vals = samples.filter((v) => !isBlank(v)).slice(0, 200);
  const h = header.toLowerCase();
  if (vals.length === 0) return "TEXT";
  const strs = vals.map((v) => (v instanceof Date ? v.toISOString() : String(v)));
  const share = (pred: (s: string, i: number) => boolean) => strs.filter(pred).length / strs.length;

  if (vals.every((v) => typeof v === "boolean") || share((s) => TRUE_WORDS.has(s.toLowerCase()) || FALSE_WORDS.has(s.toLowerCase())) === 1) {
    if (!strs.every((s) => /^[01]$/.test(s))) return "BOOLEAN";
  }
  if (share((s) => isEmail(s)) >= 0.9) return "EMAIL";
  if (share((s) => isUrl(s) && (/^https?:\/\//.test(s) || /^www\./.test(s) || /\.(com|org|net|io|fr|co\.uk|de|ch)(\/|$)/.test(s))) >= 0.9) return "URL";
  if (vals.some((v) => v instanceof Date) || share((s) => parseDateLoose(s) !== null) >= 0.9) {
    if (vals.every((v) => v instanceof Date || typeof v === "string")) return "DATE";
  }
  if (share((s) => /%$/.test(s.trim())) >= 0.9 && share((s) => parseNumberLoose(s) !== null) >= 0.9) return "PERCENT";
  const MONEY = /salary|salaire|compensation|bonus|pay|rémunération|remuneration|revenue|aum/;
  const numShare = share((s) => parseNumberLoose(s) !== null);
  if (numShare >= 0.9) {
    if (share((s) => detectCurrency(s) !== null) >= 0.5 || MONEY.test(h)) return "CURRENCY";
    return "NUMBER";
  }
  // Messy money columns ("€65,000", "62k", "not disclosed"): keep the type, flag the outliers for correction
  if (numShare >= 0.6 && MONEY.test(h)) return "CURRENCY";
  const distinct = new Set(strs.map((s) => s.trim().toLowerCase()));
  if (strs.some((s) => /[,;]/.test(s)) && share((s) => s.split(/[,;]/).every((p) => p.trim().length < 30)) === 1) {
    const parts = new Set(strs.flatMap((s) => s.split(/[,;]/).map((p) => p.trim().toLowerCase())).filter(Boolean));
    if (parts.size <= Math.max(8, strs.length / 3) && strs.length >= 5) return "MULTI_SELECT";
  }
  if (strs.length >= 6 && distinct.size < strs.length && distinct.size <= Math.min(12, Math.max(3, strs.length / 2)) && share((s) => s.length < 40) === 1) return "SINGLE_SELECT";
  if (share((s) => s.length > 120) > 0.3) return "LONG_TEXT";
  return "TEXT";
}

export type ParseResult = { ok: true; value: TypedValue } | { ok: false; error: string };

/** Parse a raw (imported or typed) value into the typed storage columns for a field type. */
export function parseValue(raw: unknown, type: FieldTypeName, opts: { currency?: string | null } = {}): ParseResult {
  if (isBlank(raw)) return { ok: true, value: { ...EMPTY_VALUE } };
  const v = { ...EMPTY_VALUE, listValue: [] as string[] };
  const s = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).trim();
  switch (type) {
    case "NUMBER":
    case "PERCENT":
    case "CURRENCY": {
      const n = typeof raw === "number" ? raw : parseNumberLoose(s);
      if (n === null) return { ok: false, error: `"${s.slice(0, 40)}" is not a number` };
      v.numberValue = type === "PERCENT" && typeof raw === "string" && s.endsWith("%") ? n / 100 : n;
      if (type === "CURRENCY") v.currency = detectCurrency(s) ?? opts.currency ?? null;
      return { ok: true, value: v };
    }
    case "DATE": {
      const d = parseDateLoose(raw);
      if (!d) return { ok: false, error: `"${s.slice(0, 40)}" is not a recognised date` };
      v.dateValue = d;
      return { ok: true, value: v };
    }
    case "BOOLEAN": {
      if (typeof raw === "boolean") v.boolValue = raw;
      else if (TRUE_WORDS.has(s.toLowerCase())) v.boolValue = true;
      else if (FALSE_WORDS.has(s.toLowerCase())) v.boolValue = false;
      else return { ok: false, error: `"${s.slice(0, 40)}" is not yes/no` };
      return { ok: true, value: v };
    }
    case "URL":
    case "SOURCE_REF":
      if (!isUrl(s)) return { ok: false, error: `"${s.slice(0, 60)}" is not a valid URL` };
      v.textValue = normalizeUrl(s);
      return { ok: true, value: v };
    case "EMAIL":
      if (!isEmail(s)) return { ok: false, error: `"${s.slice(0, 60)}" is not a valid email` };
      v.textValue = s.toLowerCase();
      return { ok: true, value: v };
    case "MULTI_SELECT":
      v.listValue = Array.from(new Set(s.split(/[,;]/).map((p) => p.trim()).filter(Boolean)));
      return { ok: true, value: v };
    default:
      v.textValue = s.slice(0, 20000);
      return { ok: true, value: v };
  }
}

export interface StoredValueLike {
  textValue?: string | null;
  numberValue?: number | null;
  dateValue?: Date | string | null;
  boolValue?: boolean | null;
  listValue?: string[] | null;
  currency?: string | null;
}

/** Human-readable string for a stored value (used in UI, history, export, change detection). */
export function displayValue(v: StoredValueLike | null | undefined, type: FieldTypeName, locale = "en"): string {
  if (!v) return "";
  switch (type) {
    case "NUMBER":
      return v.numberValue == null ? "" : new Intl.NumberFormat(locale).format(v.numberValue);
    case "PERCENT":
      return v.numberValue == null ? "" : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(v.numberValue);
    case "CURRENCY":
      if (v.numberValue == null) return "";
      return v.currency
        ? new Intl.NumberFormat(locale, { style: "currency", currency: v.currency, maximumFractionDigits: 0 }).format(v.numberValue)
        : new Intl.NumberFormat(locale).format(v.numberValue);
    case "DATE": {
      if (!v.dateValue) return "";
      const d = typeof v.dateValue === "string" ? new Date(v.dateValue) : v.dateValue;
      return d.toISOString().slice(0, 10);
    }
    case "BOOLEAN":
      return v.boolValue == null ? "" : v.boolValue ? "Yes" : "No";
    case "MULTI_SELECT":
      return (v.listValue ?? []).join(", ");
    default:
      if (v.textValue) return v.textValue;
      if (v.numberValue != null) return String(v.numberValue);
      if (v.boolValue != null) return v.boolValue ? "Yes" : "No";
      return "";
  }
}

/** Effective type used for storage: AI_RESEARCH fields store their valueType. */
export function storageType(field: { type: FieldTypeName; valueType?: FieldTypeName | null }): FieldTypeName {
  return field.type === "AI_RESEARCH" ? field.valueType ?? "TEXT" : field.type;
}

export function slugKey(name: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
  return base || "field";
}

export function normalizeName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(sa|sas|sarl|ltd|limited|llc|llp|inc|plc|gmbh|ag|group|groupe|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function domainOf(url: string | null | undefined) {
  if (!url) return null;
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// ── Import guardrails: a list must actually be a list of employers ──

/** Headers that commonly appear in career / employer lists (any language we support). */
export const CAREER_HEADER = /(soci[ée]t[ée]|entreprise|compan|employ|firm|fonds|fund|banque|bank|cabinet|groupe|group|organi[sz]ation|^nom|name|poste|r[ôo]le|job|intitul|salaire|salary|r[ée]mun|bonus|ville|city|location|lieu|pays|country|site|website|url|secteur|sector|industr|deadline|date limite|candidature|application|contact|recrut|recruit|programme|program|graduate|stage|intern|alternance|visa|remote|t[ée]l[ée]travail|aum|effectif|headcount|taille|bureau|office)/i;
export const EMPLOYER_HEADER = /^(soci[ée]t[ée]s?|entreprises?|compan(y|ies)( name)?|employers?|employeurs?|firms?|fonds|funds?|banques?|banks?|cabinets?|organi[sz]ations?|groupes?|nom( de l'entreprise| de la soci[ée]t[ée]| de l'employeur)?|name|raison sociale|structure|investisseurs?|investors?)$/i;

/** Why a value is not a plausible organisation name (null when it is). */
export function orgNameError(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return "empty name";
  if (s.length < 2) return "too short for a company name";
  if (s.length > 80) return "too long for a company name";
  if (/^[\d\s.,;:%€$£+\-/()]+$/.test(s)) return "a number, not a name";
  if (/^\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}/.test(s)) return "a date, not a name";
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s)) return "an email address";
  if (/^(https?:\/\/|www\.)/i.test(s)) return "a link (put it in the website column)";
  if (!/\p{L}/u.test(s)) return "contains no letters";
  if (s.split(/\s+/).length > 8 || /[.!?]\s+\p{L}/u.test(s)) return "a sentence, not a name";
  if (/^(oui|non|yes|no|true|false|n\/a|na|null|none|aucun|-|tbd|à définir)$/i.test(s)) return "a placeholder, not a name";
  return null;
}

/** Why a value is not a plausible person name (null when it is). */
export function personNameError(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (s.length < 3) return "Enter the person's first and last name";
  if (s.length > 80) return "Name is too long";
  if (/@|https?:|www\.|\d/.test(s)) return "A person's name cannot contain digits, an email or a link";
  if (!/^[\p{L}'’.\- ]+$/u.test(s)) return "Use letters, spaces, hyphens and apostrophes only";
  if (s.split(/\s+/).filter((w) => w.length > 1).length < 2) return "Enter the person's first and last name";
  return null;
}
