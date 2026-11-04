"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { action, AppError } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { deleteObject, putObject } from "@/server/storage";
import { mimeFor, validateUpload } from "@/server/files";

export async function uploadDocument(workspaceId: string, form: FormData) {
  return action(async () => {
    const user = await requireUser();
    await requireWorkspace(user.id, workspaceId, "EDITOR");
    rateLimit(`doc:${user.id}`, 20, 60_000);
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Choose a file.", "INVALID");
    const kind = String(form.get("kind") ?? "OTHER");
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = validateUpload(file.name, buf, "DOCUMENT");
    const { key, sha256 } = await putObject(buf);
    const f = await db.uploadedFile.create({ data: { userId: user.id, workspaceId, kind: "DOCUMENT", originalName: file.name.slice(0, 200), mimeType: mimeFor(ext), sizeBytes: buf.length, storageKey: key, sha256 } });
    await db.document.create({ data: { workspaceId, fileId: f.id, title: String(form.get("title") || file.name).slice(0, 200), kind: ["CV", "COVER_LETTER", "OTHER"].includes(kind) ? kind : "OTHER", version: (form.get("version") as string) || null } });
    revalidatePath(`/app/w/${workspaceId}/documents`);
    return null;
  });
}

export async function deleteDocument(workspaceId: string, id: string) {
  return action(async () => {
    const user = await requireUser();
    await requireWorkspace(user.id, workspaceId, "EDITOR");
    const d = await db.document.findFirst({ where: { id, workspaceId }, include: { file: true } });
    if (!d) throw new AppError("Document not found.", "NOT_FOUND");
    await deleteObject(d.file.storageKey);
    await db.uploadedFile.delete({ where: { id: d.fileId } });
    revalidatePath(`/app/w/${workspaceId}/documents`);
    return null;
  });
}
