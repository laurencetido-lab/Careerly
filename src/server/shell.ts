import { db } from "./db";

export async function shellData(userId: string) {
  const [workspaces, unread] = await Promise.all([
    db.workspace.findMany({ where: { members: { some: { userId } }, archivedAt: null }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true } }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { workspaces, unread };
}
