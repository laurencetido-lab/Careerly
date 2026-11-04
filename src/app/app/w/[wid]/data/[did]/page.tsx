import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { DataGrid } from "@/components/grid/data-grid";
import { displayValue, storageType, type FieldTypeName } from "@/lib/fields";
import type { GridField, GridRow, ViewConfig } from "@/lib/grid-types";

export default async function DatasetPage({ params, searchParams }: { params: Promise<{ wid: string; did: string }>; searchParams: Promise<{ row?: string }> }) {
  const user = await requireUserPage();
  const { wid, did } = await params;
  const { row: openRow } = await searchParams;
  const ws = await requireWorkspace(user.id, wid);
  const dataset = await db.dataset.findFirst({ where: { id: did, workspaceId: wid } });
  if (!dataset) notFound();
  const [fields, rows, views, member] = await Promise.all([
    db.fieldDefinition.findMany({ where: { datasetId: did }, orderBy: { position: "asc" } }),
    db.datasetRow.findMany({
      where: { datasetId: did },
      orderBy: { position: "asc" },
      include: { values: { include: { _count: { select: { evidence: true } } } }, company: { select: { verifyStatus: true, verifyNote: true, verifySource: true, verifiedAt: true, priority: true } } },
    }),
    db.savedView.findMany({ where: { datasetId: did, userId: user.id }, orderBy: { createdAt: "asc" } }),
    db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: wid, userId: user.id } } }),
  ]);
  const gridFields: GridField[] = fields.map((f) => ({
    id: f.id, key: f.key, name: f.name, type: f.type as FieldTypeName, valueType: f.valueType as FieldTypeName | null, hidden: f.hidden, width: f.width,
    options: f.options, currency: f.currency, formula: f.formula, isPrimary: f.isPrimary, coreBinding: f.coreBinding, researchPrompt: f.researchPrompt,
  }));
  const typeOf = new Map(fields.map((f) => [f.id, storageType({ type: f.type as FieldTypeName, valueType: f.valueType as FieldTypeName | null })]));
  const gridRows: GridRow[] = rows.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    verify: r.company ? { status: r.company.verifyStatus, note: r.company.verifyNote, source: r.company.verifySource, at: r.company.verifiedAt?.toISOString() ?? null } : undefined,
    priority: r.company?.priority ?? "NONE",
    cells: Object.fromEntries(
      r.values.map((v) => {
        const t = typeOf.get(v.fieldId) ?? "TEXT";
        const raw = t === "DATE" ? v.dateValue?.toISOString().slice(0, 10) ?? "" : t === "BOOLEAN" ? (v.boolValue == null ? "" : v.boolValue ? "yes" : "no") : t === "MULTI_SELECT" ? v.listValue.join(", ") : v.numberValue != null ? String(v.numberValue) : v.textValue ?? "";
        return [v.fieldId, { display: displayValue(v, t, user.locale), raw, num: v.numberValue ?? (v.boolValue == null ? null : v.boolValue ? 1 : 0), confidence: v.confidence, origin: v.origin, confirmed: v.manuallyConfirmed, evidence: v._count.evidence, suggestion: v.suggestionText }];
      }),
    ),
  }));
  return (
    <DataGrid
      workspaceId={wid}
      dataset={{ id: dataset.id, name: dataset.name }}
      fields={gridFields}
      rows={gridRows}
      views={views.map((v) => ({ id: v.id, name: v.name, config: v.config as unknown as ViewConfig }))}
      canEdit={member?.role !== "VIEWER"}
      openRowId={openRow ?? null}
      locations={ws.targetLocations}
    />
  );
}
