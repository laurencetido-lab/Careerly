import Link from "next/link";
import { ArrowRight, Bell, Briefcase, CalendarClock, CheckCircle2, Circle, FolderKanban, Loader2, Pencil, Search, Sparkles, Users } from "lucide-react";
import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { nextBestActions } from "@/server/nba";
import { providerStatus } from "@/server/providers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OPP_STATUS } from "@/lib/constants";
import { formatDate, relativeTime } from "@/lib/utils";
import { t } from "@/lib/i18n";

export default async function WorkspaceHome({ params }: { params: Promise<{ wid: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  const ws = await requireWorkspace(user.id, wid);
  const d = t(user.locale);
  const since = user.lastSeenAt ?? new Date(Date.now() - 7 * 86400_000);
  const now = new Date();
  const [actions, changes, deadlines, contacts, apps, jobs, counts, profile] = await Promise.all([
    nextBestActions(wid),
    db.notification.findMany({ where: { userId: user.id, workspaceId: wid, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.opportunity.findMany({ where: { workspaceId: wid, deadline: { gte: now }, status: { not: "CONFIRMED_CLOSED" } }, orderBy: { deadline: "asc" }, take: 5, include: { company: true } }),
    db.contact.findMany({ where: { workspaceId: wid, stage: { in: ["DISCOVERED", "SHORTLISTED", "MESSAGE_DRAFTED"] } }, orderBy: { relevanceScore: "desc" }, take: 4, include: { company: true } }),
    db.application.findMany({ where: { workspaceId: wid, stage: { notIn: ["ACCEPTED", "REJECTED"] }, OR: [{ nextActionAt: { lte: new Date(now.getTime() + 3 * 86400_000) } }, { deadline: { lte: new Date(now.getTime() + 14 * 86400_000), gte: now } }] }, take: 5, include: { company: true } }),
    db.researchJob.findMany({ where: { workspaceId: wid, status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { createdAt: "desc" }, take: 3 }),
    Promise.all([db.dataset.count({ where: { workspaceId: wid } }), db.contact.count({ where: { workspaceId: wid } }), db.application.count({ where: { workspaceId: wid } })]),
    db.userProfile.findUnique({ where: { userId: user.id } }),
  ]);
  await db.user.update({ where: { id: user.id }, data: { lastSeenAt: now } });
  const providers = providerStatus();
  const [datasets, contactCount, appCount] = counts;
  const setup = [
    { done: Boolean(profile?.confirmedAt), label: "Confirm your profile (CV optional)", href: "/app/profile" },
    { done: datasets > 0, label: "Import a list or discover employers", href: `/app/w/${wid}/import` },
    { done: providers.researchReady, label: "Connect research providers", href: "/app/settings" },
    { done: contactCount > 0, label: "Find people to talk to", href: `/app/w/${wid}/networking` },
    { done: appCount > 0, label: "Track your first application", href: `/app/w/${wid}/applications` },
  ];
  const setupLeft = setup.filter((s) => !s.done).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{greeting()}, {user.name.split(" ")[0]}</p>
          <h1 className="page-title">{ws.name}</h1>
          {ws.objective ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{ws.objective}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ws.targetLocations.map((l) => <Badge key={l} variant="outline">{l}</Badge>)}
            {ws.targetRoles.map((r) => <Badge key={r}>{r}</Badge>)}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild><Link href={`/app/w/${wid}/settings`}><Pencil /> Edit</Link></Button>
          <Button size="sm" asChild><Link href={`/app/w/${wid}/research?new=discover`}><Sparkles /> New research</Link></Button>
        </div>
      </div>

      {setupLeft > 0 ? (
        <Card>
          <CardHeader><CardTitle>Get set up</CardTitle><CardDescription>{setup.length - setupLeft} of {setup.length} done</CardDescription></CardHeader>
          <CardContent className="grid gap-1 sm:grid-cols-2 lg:grid-cols-5">
            {setup.map((s) => (
              <Link key={s.label} href={s.href} className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted">
                {s.done ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
                <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{d.nextActions}</CardTitle><CardDescription>Ranked from your deadlines, follow-ups, interviews and research gaps.</CardDescription></CardHeader>
          <CardContent className="space-y-1">
            {actions.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nothing urgent. Add employers or contacts to get recommendations.</p> : null}
            {actions.map((a, i) => (
              <Link key={a.key} href={a.href} className="group flex items-start gap-3 rounded-md p-2 hover:bg-muted">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{a.title}</span>
                  <span className="block text-xs text-muted-foreground">{a.reason}</span>
                </span>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="size-4" /> {d.whatChanged}</CardTitle><CardDescription>Since {formatDate(since, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {changes.length === 0 ? <p className="text-sm text-muted-foreground">No changes detected.</p> : null}
            {changes.map((n) => (
              <Link key={n.id} href={n.link ?? "#"} className="block rounded-md p-1.5 hover:bg-muted">
                <p className="text-sm">{n.title}</p>
                {n.body ? <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p> : null}
                <p className="text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</p>
              </Link>
            ))}
            <Link href="/app/notifications" className="block pt-1 text-xs text-primary hover:underline">All notifications</Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="size-4" /> {d.deadlines}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {deadlines.length === 0 ? <p className="text-sm text-muted-foreground">No sourced deadlines yet.</p> : deadlines.map((o) => (
              <div key={o.id} className="text-sm">
                <p className="truncate font-medium">{o.title}</p>
                <p className="text-xs text-muted-foreground">{o.company?.name} · {formatDate(o.deadline)} <Badge variant={OPP_STATUS[o.status].tone} className="ml-1">{OPP_STATUS[o.status].label}</Badge></p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-4" /> {d.topContacts}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {contacts.length === 0 ? <p className="text-sm text-muted-foreground">No contacts yet. Open an employer and choose “Find people”.</p> : contacts.map((c) => (
              <Link key={c.id} href={`/app/w/${wid}/networking/${c.id}`} className="block rounded p-1 text-sm hover:bg-muted">
                <p className="truncate font-medium">{c.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{c.title ?? "Role not verified"}{c.company ? ` · ${c.company.name}` : ""}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FolderKanban className="size-4" /> {d.needsAction}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {apps.length === 0 ? <p className="text-sm text-muted-foreground">Nothing due.</p> : apps.map((a) => (
              <Link key={a.id} href={`/app/w/${wid}/applications?app=${a.id}`} className="block rounded p-1 text-sm hover:bg-muted">
                <p className="truncate font-medium">{a.role}</p>
                <p className="truncate text-xs text-muted-foreground">{a.company?.name}{a.nextAction ? ` · ${a.nextAction}` : ""}{a.deadline ? ` · deadline ${formatDate(a.deadline)}` : ""}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Search className="size-4" /> {d.runningResearch}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {jobs.length === 0 ? <p className="text-sm text-muted-foreground">No research running.</p> : jobs.map((j) => (
              <Link key={j.id} href={`/app/w/${wid}/research?job=${j.id}`} className="flex items-center gap-2 rounded p-1 text-sm hover:bg-muted">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span className="truncate">{j.scope.replace(/_/g, " ").toLowerCase()} · {j.completedTasks}/{j.totalTasks}</span>
              </Link>
            ))}
            <Link href={`/app/w/${wid}/opportunities`} className="flex items-center gap-1 pt-1 text-xs text-primary hover:underline"><Briefcase className="size-3" /> Opportunities</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
