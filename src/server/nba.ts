import { db } from "./db";

export interface NextAction {
  key: string;
  title: string;
  reason: string;
  href: string;
  priority: number;
  kind: "deadline" | "followup" | "interview" | "opening" | "contact" | "research" | "setup";
}

/** Explainable "next best actions", computed only from real workspace data. */
export async function nextBestActions(workspaceId: string, now = new Date()): Promise<NextAction[]> {
  const base = `/app/w/${workspaceId}`;
  const day = 86400_000;
  const out: NextAction[] = [];
  const [opps, apps, follow, interviews, contacts, datasets] = await Promise.all([
    db.opportunity.findMany({ where: { workspaceId, status: { in: ["VERIFIED_OPEN", "EXPECTED_UNCONFIRMED", "PREVIOUSLY_OPEN_UNKNOWN"] } }, include: { company: true, applications: true }, take: 200 }),
    db.application.findMany({ where: { workspaceId }, include: { company: true } }),
    db.networkingInteraction.findMany({ where: { workspaceId, followUpDone: false, followUpAt: { lte: new Date(now.getTime() + 2 * day) } }, include: { contact: true }, take: 20 }),
    db.interview.findMany({ where: { application: { workspaceId }, scheduledAt: { gte: now, lte: new Date(now.getTime() + 10 * day) } }, include: { application: { include: { company: true } } } }),
    db.contact.findMany({ where: { workspaceId, stage: { in: ["DISCOVERED", "SHORTLISTED"] } }, orderBy: { relevanceScore: "desc" }, include: { company: true }, take: 10 }),
    db.dataset.findMany({ where: { workspaceId }, include: { fields: { where: { type: "AI_RESEARCH" } }, _count: { select: { rows: true } } } }),
  ]);

  for (const o of opps) {
    if (o.deadline && o.deadline > now && o.applications.length === 0) {
      const days = Math.ceil((o.deadline.getTime() - now.getTime()) / day);
      if (days <= 21) out.push({ key: `dl-${o.id}`, kind: "deadline", title: `Apply: ${o.title}${o.company ? ` · ${o.company.name}` : ""}`, reason: `Deadline in ${days} day${days === 1 ? "" : "s"} (${o.deadline.toISOString().slice(0, 10)}) and no application yet.`, href: `${base}/opportunities`, priority: 100 - days * 3 });
    }
    if (o.status === "VERIFIED_OPEN" && o.applications.length === 0 && o.lastVerifiedAt && now.getTime() - o.firstDiscoveredAt.getTime() < 7 * day) {
      out.push({ key: `new-${o.id}`, kind: "opening", title: `Review new opening: ${o.title}`, reason: `Verified open on ${o.company?.name ?? "the official careers site"} ${o.lastVerifiedAt.toISOString().slice(0, 10)}.`, href: `${base}/opportunities`, priority: 70 });
    }
  }
  for (const a of apps) {
    if (a.deadline && a.deadline > now && ["RESEARCHING", "INTERESTED", "NETWORKING"].includes(a.stage)) {
      const days = Math.ceil((a.deadline.getTime() - now.getTime()) / day);
      if (days <= 21) out.push({ key: `adl-${a.id}`, kind: "deadline", title: `Submit application: ${a.role}${a.company ? ` · ${a.company.name}` : ""}`, reason: `Your deadline is in ${days} day${days === 1 ? "" : "s"}; stage is still “${a.stage.toLowerCase()}”.`, href: `${base}/applications`, priority: 95 - days * 3 });
    }
    if (a.nextActionAt && a.nextActionAt <= new Date(now.getTime() + day) && a.nextAction) {
      out.push({ key: `next-${a.id}`, kind: "deadline", title: a.nextAction, reason: `Next action you set for ${a.role}${a.company ? ` at ${a.company.name}` : ""}, due ${a.nextActionAt.toISOString().slice(0, 10)}.`, href: `${base}/applications`, priority: 80 });
    }
  }
  for (const f of follow) {
    const overdue = f.followUpAt! < now;
    out.push({ key: `fu-${f.id}`, kind: "followup", title: `Follow up with ${f.contact.fullName}`, reason: `${overdue ? "Overdue since" : "Due"} ${f.followUpAt!.toISOString().slice(0, 10)}${f.nextAction ? `: ${f.nextAction}` : ""}.`, href: `${base}/networking/${f.contactId}`, priority: overdue ? 85 : 65 });
  }
  for (const i of interviews) {
    const days = Math.ceil((i.scheduledAt!.getTime() - now.getTime()) / day);
    out.push({ key: `iv-${i.id}`, kind: "interview", title: `Prepare: ${i.round} at ${i.application.company?.name ?? i.application.role}`, reason: `Interview in ${days} day${days === 1 ? "" : "s"}; preparation ${i.prepProgress}% complete.`, href: `${base}/applications?app=${i.applicationId}`, priority: 90 - days * 4 });
  }
  const topContact = contacts[0];
  if (topContact) {
    out.push({ key: `ct-${topContact.id}`, kind: "contact", title: `Reach out to ${topContact.fullName}${topContact.company ? ` (${topContact.company.name})` : ""}`, reason: topContact.recommendationReason ?? "Highest-ranked contact you haven't messaged yet.", href: `${base}/networking/${topContact.id}`, priority: 55 });
  }
  for (const d of datasets) {
    if (!d.fields.length || !d._count.rows) continue;
    const filled = await db.fieldValue.count({ where: { fieldId: { in: d.fields.map((f) => f.id) }, confidence: { not: null } } });
    const missing = d.fields.length * d._count.rows - filled;
    if (missing > 0) out.push({ key: `rs-${d.id}`, kind: "research", title: `Research ${missing} missing value${missing === 1 ? "" : "s"} in “${d.name}”`, reason: `${d.fields.length} AI-researched field${d.fields.length === 1 ? "" : "s"} across ${d._count.rows} rows have not been researched yet.`, href: `${base}/data/${d.id}`, priority: 40 });
  }
  if (!datasets.length) out.push({ key: "setup", kind: "setup", title: "Add employers to research", reason: "Import a spreadsheet or let Careerly discover employers that match your objective.", href: `${base}/research?new=discover`, priority: 60 });
  return out.sort((a, b) => b.priority - a.priority).slice(0, 5);
}
