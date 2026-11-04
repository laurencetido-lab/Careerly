import Link from "next/link";
import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Agenda" };

type Item = { at: Date; kind: "Deadline" | "Follow-up" | "Interview" | "Next action"; title: string; detail: string; href: string };

export default async function AgendaPage({ params }: { params: Promise<{ wid: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  await requireWorkspace(user.id, wid);
  const since = new Date(Date.now() - 30 * 86400_000);
  const [opps, apps, follow, interviews] = await Promise.all([
    db.opportunity.findMany({ where: { workspaceId: wid, deadline: { gte: since }, status: { not: "CONFIRMED_CLOSED" } }, include: { company: true } }),
    db.application.findMany({ where: { workspaceId: wid, OR: [{ deadline: { gte: since } }, { nextActionAt: { gte: since } }], stage: { notIn: ["ACCEPTED", "REJECTED"] } }, include: { company: true } }),
    db.networkingInteraction.findMany({ where: { workspaceId: wid, followUpDone: false, followUpAt: { not: null } }, include: { contact: { include: { company: true } } } }),
    db.interview.findMany({ where: { application: { workspaceId: wid }, scheduledAt: { gte: since } }, include: { application: { include: { company: true } } } }),
  ]);
  const items: Item[] = [
    ...opps.map((o) => ({ at: o.deadline!, kind: "Deadline" as const, title: o.title, detail: o.company?.name ?? "", href: `/app/w/${wid}/opportunities` })),
    ...apps.flatMap((a) => [
      ...(a.deadline ? [{ at: a.deadline, kind: "Deadline" as const, title: `Application: ${a.role}`, detail: a.company?.name ?? "", href: `/app/w/${wid}/applications?app=${a.id}` }] : []),
      ...(a.nextActionAt ? [{ at: a.nextActionAt, kind: "Next action" as const, title: a.nextAction ?? "Next action", detail: `${a.role}${a.company ? ` · ${a.company.name}` : ""}`, href: `/app/w/${wid}/applications?app=${a.id}` }] : []),
    ]),
    ...follow.map((f) => ({ at: f.followUpAt!, kind: "Follow-up" as const, title: `Follow up with ${f.contact.fullName}`, detail: f.nextAction ?? f.contact.company?.name ?? "", href: `/app/w/${wid}/networking/${f.contactId}` })),
    ...interviews.map((i) => ({ at: i.scheduledAt!, kind: "Interview" as const, title: `${i.round}`, detail: `${i.application.role}${i.application.company ? ` · ${i.application.company.name}` : ""} · ${i.prepProgress}% prepared`, href: `/app/w/${wid}/applications?app=${i.applicationId}` })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const groups: [string, Item[]][] = [
    ["Overdue", items.filter((i) => i.at < startOfToday)],
    ["This week", items.filter((i) => i.at >= startOfToday && i.at < new Date(startOfToday.getTime() + 7 * 86400_000))],
    ["Later", items.filter((i) => i.at >= new Date(startOfToday.getTime() + 7 * 86400_000))],
  ];
  const tone = { Deadline: "danger", "Follow-up": "warning", Interview: "primary", "Next action": "outline" } as const;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Agenda" description="Every date in one place: deadlines, follow-ups, interviews and the next actions you set." />
      {items.length === 0 ? (
        <EmptyState title="Nothing scheduled">Add a deadline to an application or opportunity, or set a follow-up after a conversation.</EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.filter(([, g]) => g.length).map(([label, g]) => (
            <section key={label}>
              <h2 className={`mb-2 text-sm font-semibold ${label === "Overdue" ? "text-destructive" : ""}`}>{label} · {g.length}</h2>
              <Card className="divide-y">
                {g.map((i, k) => (
                  <Link key={k} href={i.href} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50">
                    <span className="w-20 shrink-0 text-sm tabular-nums text-muted-foreground">{formatDate(i.at, { day: "numeric", month: "short" })}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{i.title}</span><span className="block truncate text-xs text-muted-foreground">{i.detail}</span></span>
                    <Badge variant={tone[i.kind]}>{i.kind}</Badge>
                  </Link>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
