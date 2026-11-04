import type { FieldTypeName } from "./fields";

export interface GridField {
  id: string;
  key: string;
  name: string;
  type: FieldTypeName;
  valueType: FieldTypeName | null;
  hidden: boolean;
  width: number;
  options: string[];
  currency: string | null;
  formula: string | null;
  isPrimary: boolean;
  coreBinding: string | null;
  researchPrompt: string | null;
}

export interface GridCell {
  display: string;
  raw: string;
  num: number | null;
  confidence: string | null;
  origin: string;
  confirmed: boolean;
  evidence: number;
  suggestion: string | null;
}

export interface GridRow {
  id: string;
  companyId: string | null;
  verify?: { status: string; note: string | null; source: string | null; at: string | null };
  priority?: string;
  cells: Record<string, GridCell>;
}

export interface ViewConfig {
  sort: { fieldId: string; dir: "asc" | "desc" } | null;
  filters: { fieldId: string; op: "contains" | "equals" | "gt" | "lt" | "empty" | "notEmpty"; value: string }[];
  hidden: string[];
  groupBy: string | null;
  search: string;
}
