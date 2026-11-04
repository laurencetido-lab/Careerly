import { db } from "./db";

export async function audit(entry: {
  userId?: string | null;
  workspaceId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
  detail?: string;
}) {
  try {
    await db.auditLog.create({ data: { ...entry, detail: entry.detail?.slice(0, 2000) } });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
