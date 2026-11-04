import Link from "next/link";
import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { PageHeader } from "@/components/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { MarkAllRead } from "@/components/mark-read";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUserPage();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200, include: { workspace: { select: { name: true } } } });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" description="Changes, new openings, deadlines and follow-ups. Each alert is sent once." actions={items.some((i) => !i.readAt) ? <MarkAllRead /> : null} />
      {items.length === 0 ? <EmptyState title="You're all caught up">Notifications appear when research finishes, monitored values change or deadlines approach.</EmptyState> : (
        <Card className="divide-y">
          {items.map((n) => (
            <Link key={n.id} href={n.link ?? "#"} className={`flex gap-3 px-4 py-3 hover:bg-muted/50 ${n.readAt ? "" : "bg-accent/30"}`}>
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-primary"}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{n.title}</span>
                {n.body ? <span className="block text-sm text-muted-foreground">{n.body}</span> : null}
                <span className="block text-xs text-muted-foreground">{n.workspace?.name ? `${n.workspace.name} · ` : ""}{relativeTime(n.createdAt)}</span>
              </span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
