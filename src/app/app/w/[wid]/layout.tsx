import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { shellData } from "@/server/shell";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ wid: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  const ws = await requireWorkspace(user.id, wid).catch(() => null);
  if (!ws) notFound();
  const { workspaces, unread } = await shellData(user.id);
  return (
    <Shell user={user} workspaces={workspaces} unread={unread} workspace={{ id: ws.id, name: ws.name }}>
      {children}
    </Shell>
  );
}
