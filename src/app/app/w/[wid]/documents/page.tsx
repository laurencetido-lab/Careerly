import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { PageHeader } from "@/components/page-header";
import { DocumentsView } from "@/components/documents";

export const metadata = { title: "Documents" };

export default async function DocumentsPage({ params }: { params: Promise<{ wid: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  await requireWorkspace(user.id, wid);
  const [docs, sheets] = await Promise.all([
    db.document.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, include: { file: true } }),
    db.uploadedFile.findMany({ where: { workspaceId: wid, kind: "SPREADSHEET" }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Documents" description="CV versions, cover letters and other files for this search. Stored privately; only workspace members can download them." />
      <DocumentsView
        workspaceId={wid}
        docs={docs.map((d) => ({ id: d.id, fileId: d.fileId, title: d.title, kind: d.kind, version: d.version, size: d.file.sizeBytes, name: d.file.originalName, createdAt: d.createdAt.toISOString() }))}
        sheets={sheets.map((s) => ({ id: s.id, name: s.originalName, size: s.sizeBytes, createdAt: s.createdAt.toISOString() }))}
      />
    </div>
  );
}
