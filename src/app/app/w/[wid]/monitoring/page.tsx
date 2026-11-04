import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { providerStatus } from "@/server/providers";
import { PageHeader } from "@/components/page-header";
import { MonitoringView } from "@/components/monitoring";

export const metadata = { title: "Monitoring" };

export default async function MonitoringPage({ params }: { params: Promise<{ wid: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  await requireWorkspace(user.id, wid);
  const [rules, datasets] = await Promise.all([
    db.monitoringRule.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, include: { dataset: true } }),
    db.dataset.findMany({ where: { workspaceId: wid }, include: { fields: { where: { isPrimary: false, type: { not: "FORMULA" } }, orderBy: { position: "asc" } }, _count: { select: { rows: true } } } }),
  ]);
  const fieldNames = new Map(datasets.flatMap((d) => d.fields.map((f) => [f.id, f.name] as const)));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Monitoring" description="Scheduled re-research keeps your data current. Changes are recorded with the old value, new value and source, and confirmed values are never overwritten." />
      <MonitoringView
        workspaceId={wid}
        researchReady={providerStatus().researchReady}
        datasets={datasets.map((d) => ({ id: d.id, name: d.name, rows: d._count.rows, fields: d.fields.map((f) => ({ id: f.id, name: f.name, ai: f.type === "AI_RESEARCH" })) }))}
        rules={rules.map((r) => ({ id: r.id, name: r.name, dataset: r.dataset.name, fields: r.fieldIds.map((id) => fieldNames.get(id) ?? "deleted field"), frequency: r.frequency, intervalDays: r.intervalDays, cap: r.creditCapPerRun, enabled: r.enabled, lastRunAt: r.lastRunAt?.toISOString() ?? null, nextRunAt: r.nextRunAt.toISOString() }))}
      />
    </div>
  );
}
