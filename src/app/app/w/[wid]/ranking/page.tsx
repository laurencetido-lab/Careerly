import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { PageHeader } from "@/components/page-header";
import { RankingView } from "@/components/ranking";
import { displayValue, storageType, type FieldTypeName } from "@/lib/fields";

export const metadata = { title: "Ranking" };

export default async function RankingPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<{ dataset?: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  const sp = await searchParams;
  await requireWorkspace(user.id, wid);
  const datasets = await db.dataset.findMany({ where: { workspaceId: wid }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
  const models = await db.scoringModel.findMany({ where: { workspaceId: wid }, include: { criteria: true } });
  const datasetId = sp.dataset ?? models[0]?.datasetId ?? datasets[0]?.id;
  const fields = datasetId ? await db.fieldDefinition.findMany({ where: { datasetId }, orderBy: { position: "asc" } }) : [];
  const rows = datasetId ? await db.datasetRow.findMany({ where: { datasetId }, include: { values: true } }) : [];
  const primary = fields.find((f) => f.isPrimary);
  const scorable = fields.filter((f) => ["NUMBER", "CURRENCY", "PERCENT", "BOOLEAN", "SINGLE_SELECT", "TEXT"].includes(storageType({ type: f.type as FieldTypeName, valueType: f.valueType as FieldTypeName | null })) && !f.isPrimary);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Ranking & analytics" description="Your own criteria and weights. Missing data is never guessed: rankings built on incomplete data are marked provisional." />
      <RankingView
        workspaceId={wid}
        datasets={datasets}
        datasetId={datasetId ?? null}
        model={models.find((m) => m.datasetId === datasetId) ? { id: models.find((m) => m.datasetId === datasetId)!.id, name: models.find((m) => m.datasetId === datasetId)!.name, criteria: models.find((m) => m.datasetId === datasetId)!.criteria.map((c) => ({ fieldId: c.fieldId, weight: c.weight, direction: c.direction as "HIGHER", constraintType: c.constraintType as "NONE", constraintValue: c.constraintValue })) } : null}
        fields={scorable.map((f) => ({ id: f.id, name: f.name, type: storageType({ type: f.type as FieldTypeName, valueType: f.valueType as FieldTypeName | null }) }))}
        rows={rows.map((r) => ({
          id: r.id,
          label: (primary && r.values.find((v) => v.fieldId === primary.id)?.textValue) || "Unnamed",
          values: Object.fromEntries(r.values.map((v) => {
            const f = fields.find((x) => x.id === v.fieldId);
            const t = f ? storageType({ type: f.type as FieldTypeName, valueType: f.valueType as FieldTypeName | null }) : "TEXT";
            return [v.fieldId, { num: v.numberValue ?? (v.boolValue == null ? null : v.boolValue ? 1 : 0), display: displayValue(v, t) }];
          })),
        }))}
      />
    </div>
  );
}
