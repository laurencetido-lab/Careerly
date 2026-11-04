import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Workspaces" };

export default async function Workspaces() {
  const user = await requireUserPage();
  const list = await db.workspace.findMany({
    where: { members: { some: { userId: user.id } }, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { companies: true, contacts: true, applications: true, opportunities: true } } },
  });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="My workspaces" description="Each workspace is an independent career search." actions={<Button asChild><Link href="/app/onboarding"><Plus /> New workspace</Link></Button>} />
      {list.length === 0 ? (
        <EmptyState title="No workspaces yet" action={<Button asChild><Link href="/app/onboarding">Create your first workspace</Link></Button>}>Start by describing your career objective.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((w) => (
            <Link key={w.id} href={`/app/w/${w.id}`}>
              <Card className="h-full p-4 transition hover:border-primary/50">
                <p className="font-medium">{w.name}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{w.objective || "No objective yet"}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {w._count.companies} companies · {w._count.opportunities} opportunities · {w._count.contacts} contacts · {w._count.applications} applications · updated {relativeTime(w.updatedAt)}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
