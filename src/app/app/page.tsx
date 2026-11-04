import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";

export default async function AppIndex() {
  const user = await requireUserPage();
  const m = await db.workspaceMember.findFirst({ where: { userId: user.id, workspace: { archivedAt: null } }, orderBy: { workspace: { updatedAt: "desc" } } });
  redirect(m ? `/app/w/${m.workspaceId}` : "/app/onboarding");
}
