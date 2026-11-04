import { createHash } from "node:crypto";
import { db } from "./db";

/** Create an in-app notification once per (user, dedupeKey). Returns true if created. */
export async function notify(n: { userId: string; workspaceId?: string | null; type: string; title: string; body?: string; link?: string; dedupeKey: string }) {
  const key = n.dedupeKey.length > 180 ? createHash("sha256").update(n.dedupeKey).digest("hex") : n.dedupeKey;
  try {
    await db.notification.create({ data: { ...n, dedupeKey: key } });
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return false; // duplicate → suppressed
    throw e;
  }
}

/** Notify every member of a workspace. */
export async function notifyWorkspace(workspaceId: string, n: Omit<Parameters<typeof notify>[0], "userId" | "workspaceId">) {
  const members = await db.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true } });
  for (const m of members) await notify({ ...n, userId: m.userId, workspaceId });
}
