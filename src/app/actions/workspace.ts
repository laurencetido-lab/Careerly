"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { action } from "@/server/errors";
import { audit } from "@/server/audit";
import { DEFAULT_STAGES } from "@/lib/constants";

const list = (s: unknown) =>
  String(s ?? "")
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12);

const WorkspaceSchema = z.object({
  name: z.string().trim().min(1, "Give your workspace a name").max(120),
  objective: z.string().trim().max(2000).default(""),
  targetLocations: z.array(z.string().max(80)).max(12),
  targetRoles: z.array(z.string().max(80)).max(12),
  searchLanguages: z.array(z.enum(["en", "fr", "de", "es", "it", "nl", "pt"])).min(1).max(4),
});



export async function createWorkspace(input: { name: string; objective: string; targetLocations: string; targetRoles: string; searchLanguages: string[] }) {
  return action(async () => {
    const user = await requireUser();
    const data = WorkspaceSchema.parse({ ...input, targetLocations: list(input.targetLocations), targetRoles: list(input.targetRoles) });
    const ws = await db.workspace.create({
      data: {
        ...data,
        ownerId: user.id,
        members: { create: { userId: user.id, role: "OWNER" } },
        stages: { create: DEFAULT_STAGES.map(([key, label], i) => ({ key, label, position: i, terminal: key === "ACCEPTED" || key === "REJECTED" })) },
      },
    });
    await audit({ userId: user.id, workspaceId: ws.id, action: "workspace.create", targetId: ws.id });
    return { id: ws.id };
  });
}

export async function updateWorkspace(workspaceId: string, input: { name: string; objective: string; targetLocations: string; targetRoles: string; searchLanguages: string[] }) {
  return action(async () => {
    const user = await requireUser();
    await requireWorkspace(user.id, workspaceId, "EDITOR");
    const data = WorkspaceSchema.parse({ ...input, targetLocations: list(input.targetLocations), targetRoles: list(input.targetRoles) });
    await db.workspace.update({ where: { id: workspaceId }, data });
    revalidatePath(`/app/w/${workspaceId}`, "layout");
    return null;
  });
}

export async function deleteWorkspace(workspaceId: string) {
  return action(async () => {
    const user = await requireUser();
    await requireWorkspace(user.id, workspaceId, "OWNER");
    await db.workspace.delete({ where: { id: workspaceId } });
    await audit({ userId: user.id, action: "workspace.delete", targetId: workspaceId });
    revalidatePath("/app");
    return null;
  });
}
