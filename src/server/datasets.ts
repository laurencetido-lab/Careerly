import { db } from "./db";

/** Default columns for a company dataset created by Careerly (not by import). */
export async function ensureCompanyDataset(workspaceId: string, datasetId: string | null, name: string) {
  if (datasetId) {
    const ds = await db.dataset.findFirst({ where: { id: datasetId, workspaceId } });
    if (ds) {
      await ensureDiscoveryFields(ds.id);
      return ds;
    }
  }
  const ds = await db.dataset.create({ data: { workspaceId, name, entityType: "COMPANY" } });
  await db.fieldDefinition.createMany({
    data: [
      { datasetId: ds.id, key: "company", name: "Company", type: "TEXT", isPrimary: true, coreBinding: "company.name", position: 0, width: 220 },
      { datasetId: ds.id, key: "website", name: "Website", type: "URL", coreBinding: "company.website", position: 1 },
    ],
  });
  await ensureDiscoveryFields(ds.id);
  return ds;
}

async function ensureDiscoveryFields(datasetId: string) {
  const max = await db.fieldDefinition.aggregate({ where: { datasetId }, _max: { position: true } });
  let pos = (max._max.position ?? 0) + 1;
  for (const f of [
    { key: "why_it_matches", name: "Why it matches", type: "LONG_TEXT" as const, width: 320 },
    { key: "recruiting_evidence", name: "Recruiting (official source)", type: "BOOLEAN" as const, width: 170 },
  ]) {
    const exists = await db.fieldDefinition.findUnique({ where: { datasetId_key: { datasetId, key: f.key } } });
    if (!exists) await db.fieldDefinition.create({ data: { datasetId, ...f, position: pos++ } });
  }
}
