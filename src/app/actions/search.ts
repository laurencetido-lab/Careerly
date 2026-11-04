"use server";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { action } from "@/server/errors";

/** Quick search across the workspace (employers, contacts, applications, opportunities). */
export async function quickSearch(workspaceId: string, q: string) {
  return action(async () => {
    const user = await requireUser();
    await requireWorkspace(user.id, workspaceId);
    const term = q.trim().slice(0, 80);
    if (term.length < 2) return [];
    const like = { contains: term, mode: "insensitive" as const };
    const [companies, contacts, apps, opps] = await Promise.all([
      db.company.findMany({ where: { workspaceId, name: like }, take: 6, include: { rows: { take: 1, select: { id: true, datasetId: true } } } }),
      db.contact.findMany({ where: { workspaceId, OR: [{ fullName: like }, { title: like }] }, take: 6, include: { company: true } }),
      db.application.findMany({ where: { workspaceId, role: like }, take: 4, include: { company: true } }),
      db.opportunity.findMany({ where: { workspaceId, title: like }, take: 4, include: { company: true } }),
    ]);
    const base = `/app/w/${workspaceId}`;
    return [
      ...companies.map((c) => ({ kind: "Employer", title: c.name, detail: c.website ?? "", href: c.rows[0] ? `${base}/data/${c.rows[0].datasetId}?row=${c.rows[0].id}` : `${base}/data` })),
      ...contacts.map((c) => ({ kind: "Contact", title: c.fullName, detail: [c.title, c.company?.name].filter(Boolean).join(" · "), href: `${base}/networking/${c.id}` })),
      ...apps.map((a) => ({ kind: "Application", title: a.role, detail: a.company?.name ?? "", href: `${base}/applications?app=${a.id}` })),
      ...opps.map((o) => ({ kind: "Opportunity", title: o.title, detail: o.company?.name ?? "", href: `${base}/opportunities` })),
    ];
  });
}
