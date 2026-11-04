import { Shell } from "@/components/shell";
import { requireUserPage } from "@/server/auth";
import { shellData } from "@/server/shell";

export default async function GlobalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage();
  const { workspaces, unread } = await shellData(user.id);
  return (
    <Shell user={user} workspaces={workspaces} unread={unread} workspace={null}>
      {children}
    </Shell>
  );
}
