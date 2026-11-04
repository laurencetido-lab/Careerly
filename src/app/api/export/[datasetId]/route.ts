import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { exportDataset } from "@/server/export-dataset";
import { audit } from "@/server/audit";
import { rateLimit } from "@/server/ratelimit";

export async function GET(req: Request, { params }: { params: Promise<{ datasetId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { datasetId } = await params;
  const workspaceId = new URL(req.url).searchParams.get("workspace") ?? "";
  try {
    rateLimit(`export:${user.id}`, 20, 60_000);
    await requireWorkspace(user.id, workspaceId);
    const { buf, filename } = await exportDataset(workspaceId, datasetId);
    await audit({ userId: user.id, workspaceId, action: "dataset.export", targetId: datasetId });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
