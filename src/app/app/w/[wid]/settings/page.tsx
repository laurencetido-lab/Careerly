import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { WorkspaceForm } from "@/components/workspace-form";
import { DeleteWorkspace } from "@/components/delete-workspace";

export default async function WorkspaceSettings({ params }: { params: Promise<{ wid: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  const ws = await requireWorkspace(user.id, wid, "EDITOR");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Workspace settings" description="Your objective, locations and roles guide every research plan." />
      <Card><CardContent className="pt-5"><WorkspaceForm workspaceId={wid} initial={ws} /></CardContent></Card>
      <DeleteWorkspace workspaceId={wid} name={ws.name} />
    </div>
  );
}
