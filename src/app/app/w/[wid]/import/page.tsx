import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { PageHeader } from "@/components/page-header";
import { ImportWizard } from "@/components/import-wizard";

export const metadata = { title: "Import data" };

export default async function ImportPage({ params }: { params: Promise<{ wid: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  await requireWorkspace(user.id, wid, "EDITOR");
  const datasets = await db.dataset.findMany({ where: { workspaceId: wid }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Import data" description="Bring your own list of employers. Careerly keeps every column and helps you enrich it." />
      <ImportWizard workspaceId={wid} datasets={datasets} />
    </div>
  );
}
