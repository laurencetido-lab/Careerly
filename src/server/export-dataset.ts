import { db } from "./db";
import { buildWorkbook } from "./export";
import { evaluateFormula } from "@/lib/formula";
import { displayValue, storageType, type FieldTypeName } from "@/lib/fields";

/** Build the XLSX for a dataset: data sheet + evidence + sources. Caller must authorize. */
export async function exportDataset(workspaceId: string, datasetId: string) {
  const ds = await db.dataset.findFirstOrThrow({ where: { id: datasetId, workspaceId } });
  const fields = await db.fieldDefinition.findMany({ where: { datasetId }, orderBy: { position: "asc" } });
  const rows = await db.datasetRow.findMany({
    where: { datasetId },
    orderBy: { position: "asc" },
    include: { values: { include: { evidence: { include: { source: true } } } } },
  });
  const byName = new Map(fields.map((f) => [f.name.toLowerCase(), f.id]));
  const dataRows: unknown[][] = [];
  const evidenceRows: unknown[][] = [];
  const sources = new Map<string, { url: string; title: string | null; domain: string; tier: number }>();
  for (const r of rows) {
    const vals = new Map(r.values.map((v) => [v.fieldId, v]));
    const primary = fields.find((f) => f.isPrimary);
    const name = primary ? vals.get(primary.id)?.textValue ?? "" : "";
    const line: unknown[] = [];
    for (const f of fields) {
      const t = storageType({ type: f.type as FieldTypeName, valueType: f.valueType as FieldTypeName | null });
      if (f.type === "FORMULA" && f.formula) {
        let n: number | null = null;
        try {
          n = evaluateFormula(f.formula, (ref) => {
            const v = vals.get(byName.get(ref.toLowerCase()) ?? "");
            return v?.numberValue ?? (v?.boolValue == null ? null : v.boolValue ? 1 : 0);
          });
        } catch {}
        line.push(n);
        continue;
      }
      const v = vals.get(f.id);
      if (!v) line.push(null);
      else if (["NUMBER", "CURRENCY", "PERCENT"].includes(t)) line.push(v.numberValue);
      else if (t === "DATE") line.push(v.dateValue);
      else if (t === "BOOLEAN") line.push(v.boolValue == null ? null : v.boolValue ? "Yes" : "No");
      else line.push(displayValue(v, t));
      if (v && (v.confidence || v.evidence.length)) {
        for (const e of v.evidence) {
          sources.set(e.source.url, e.source);
          evidenceRows.push([name, f.name, e.value, e.confidence, e.excerpt, e.source.url, e.source.title, e.source.publishedAt, e.retrievedAt, e.verifiedAt, e.origin === "MANUAL" ? "Manual" : "Research"]);
        }
        if (!v.evidence.length && v.confidence) evidenceRows.push([name, f.name, displayValue(v, t), v.confidence, v.researchNotes, null, null, null, v.researchedAt, null, "Research"]);
      }
    }
    dataRows.push(line);
  }
  const confCols = fields.filter((f) => f.type === "AI_RESEARCH");
  const header = fields.map((f) => ({ header: f.name, width: Math.min(60, Math.max(12, Math.round(f.width / 7))) }));
  // Add a confidence column next to each researched field for spreadsheet users
  const withConf = { columns: [...header], rows: dataRows.map((r) => [...r]) };
  for (const f of confCols) {
    withConf.columns.push({ header: `${f.name} — confidence`, width: 16 });
    rows.forEach((r, i) => withConf.rows[i].push(r.values.find((v) => v.fieldId === f.id)?.confidence ?? null));
  }
  const buf = await buildWorkbook([
    { name: ds.name, ...withConf },
    {
      name: "Evidence",
      columns: ["Row", "Field", "Value", "Confidence", "Evidence excerpt", "Source URL", "Source title", "Published", "Retrieved", "Verified", "Origin"].map((h) => ({ header: h, width: h === "Evidence excerpt" ? 60 : 20 })),
      rows: evidenceRows,
    },
    {
      name: "Sources",
      columns: [{ header: "URL", width: 60 }, { header: "Title", width: 40 }, { header: "Domain", width: 24 }, { header: "Source tier (1 = official)", width: 20 }],
      rows: [...sources.values()].map((s) => [s.url, s.title, s.domain, s.tier]),
    },
  ]);
  return { buf, filename: `${ds.name.replace(/[^\w\- ]+/g, "").trim() || "careerly"}-${new Date().toISOString().slice(0, 10)}.xlsx` };
}
