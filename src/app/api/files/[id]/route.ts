import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { getObject } from "@/server/storage";

/** Authorized download of a stored file (own files, or files in a workspace the user belongs to). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const f = await db.uploadedFile.findFirst({
    where: { id, OR: [{ userId: user.id, workspaceId: null }, { workspace: { members: { some: { userId: user.id } } } }] },
  });
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  const buf = await getObject(f.storageKey);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(f.originalName)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
