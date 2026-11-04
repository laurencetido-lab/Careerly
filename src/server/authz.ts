import type { MemberRole } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";

const RANK: Record<MemberRole, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

/**
 * Tenant guard. Every workspace-scoped operation must pass through here.
 * Returns "not found" (not "forbidden") for workspaces the user is not a member of,
 * so IDs from other tenants are indistinguishable from non-existent ones.
 */
export async function requireWorkspace(userId: string, workspaceId: string, minRole: MemberRole = "VIEWER") {
  if (!workspaceId || typeof workspaceId !== "string") throw new AppError("Workspace not found.", "NOT_FOUND");
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: true },
  });
  if (!membership || membership.workspace.archivedAt) throw new AppError("Workspace not found.", "NOT_FOUND");
  if (RANK[membership.role] < RANK[minRole]) throw new AppError("You do not have permission to do this.", "FORBIDDEN");
  return membership.workspace;
}

/** Load a dataset only if it belongs to the workspace. */
export async function requireDataset(workspaceId: string, datasetId: string) {
  const ds = await db.dataset.findFirst({ where: { id: datasetId, workspaceId } });
  if (!ds) throw new AppError("Table not found.", "NOT_FOUND");
  return ds;
}

export async function requireField(workspaceId: string, fieldId: string) {
  const f = await db.fieldDefinition.findFirst({ where: { id: fieldId, dataset: { workspaceId } } });
  if (!f) throw new AppError("Field not found.", "NOT_FOUND");
  return f;
}

export async function requireRow(workspaceId: string, rowId: string) {
  const r = await db.datasetRow.findFirst({ where: { id: rowId, dataset: { workspaceId } } });
  if (!r) throw new AppError("Row not found.", "NOT_FOUND");
  return r;
}

export async function requireContact(workspaceId: string, contactId: string) {
  const c = await db.contact.findFirst({ where: { id: contactId, workspaceId } });
  if (!c) throw new AppError("Contact not found.", "NOT_FOUND");
  return c;
}
