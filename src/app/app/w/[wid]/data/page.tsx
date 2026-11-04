import Link from "next/link";
import { redirect } from "next/navigation";
import { Table2, Upload } from "lucide-react";
import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { NewTableButton } from "@/components/new-table";
import { relativeTime } from "@/lib/utils";

export default async function DataIndex({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<{ all?: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  const { all } = await searchParams;
  await requireWorkspace(user.id, wid);
  const datasets = await db.dataset.findMany({ where: { workspaceId: wid }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { rows: true, fields: true } } } });
  if (datasets.length === 1 && !all) redirect(`/app/w/${wid}/data/${datasets[0].id}`);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Companies" description="Your employer tables. Each one can have its own columns." actions={<><NewTableButton workspaceId={wid} /><Button asChild><Link href={`/app/w/${wid}/import`}><Upload /> Import</Link></Button></>} />
      {datasets.length === 0 ? (
        <EmptyState icon={<Table2 />} title="No tables yet" action={<div className="flex gap-2"><Button asChild><Link href={`/app/w/${wid}/import`}>Import a spreadsheet</Link></Button><Button variant="outline" asChild><Link href={`/app/w/${wid}/research?new=discover`}>Discover employers</Link></Button></div>}>
          Import an Excel/CSV list of employers, or let Careerly discover them from your objective.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {datasets.map((d) => (
            <Link key={d.id} href={`/app/w/${wid}/data/${d.id}`}>
              <Card className="p-4 transition hover:border-primary/50">
                <p className="font-medium">{d.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{d._count.rows} rows · {d._count.fields} fields · updated {relativeTime(d.updatedAt)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
