import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";

/** GDPR data export: everything owned by or visible to the user, as JSON. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const workspaces = await db.workspace.findMany({
    where: { members: { some: { userId: user.id } } },
    include: {
      datasets: { include: { fields: true, rows: { include: { values: { include: { evidence: { include: { source: true } }, history: true } } } } } },
      companies: true, opportunities: true,
      contacts: { include: { interactions: true, drafts: true } },
      applications: { include: { interviews: true } },
      compensation: true, monitoringRules: true, scoringModels: { include: { criteria: true } }, stages: true,
      jobs: { include: { logs: true } }, plans: { include: { items: true } },
    },
  });
  const { passwordHash: _ph, ...account } = user;
  void _ph;
  const data = {
    exportedAt: new Date().toISOString(),
    account,
    profile: await db.userProfile.findUnique({ where: { userId: user.id }, include: { education: true, experience: true } }),
    files: await db.uploadedFile.findMany({ where: { userId: user.id }, select: { id: true, kind: true, originalName: true, sizeBytes: true, createdAt: true } }),
    notifications: await db.notification.findMany({ where: { userId: user.id } }),
    usage: await db.usageRecord.findMany({ where: { userId: user.id } }),
    auditLog: await db.auditLog.findMany({ where: { userId: user.id } }),
    workspaces,
  };
  await audit({ userId: user.id, action: "account.export" });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="careerly-export-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
}
