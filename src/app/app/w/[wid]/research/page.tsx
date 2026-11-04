import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { providerStatus } from "@/server/providers";
import { creditSummary } from "@/server/credits";
import { PageHeader } from "@/components/page-header";
import { ResearchHub } from "@/components/research-hub";

export const metadata = { title: "Research" };

export default async function ResearchPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<{ new?: string; job?: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  const sp = await searchParams;
  const ws = await requireWorkspace(user.id, wid);
  const [jobs, datasets, companies, credits] = await Promise.all([
    db.researchJob.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 30, include: { plan: true } }),
    db.dataset.findMany({ where: { workspaceId: wid }, select: { id: true, name: true } }),
    db.company.findMany({ where: { workspaceId: wid }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    creditSummary(user.id),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Research" description="Plan, approve and follow live internet research. Jobs keep running when you close the browser." />
      <ResearchHub
        workspaceId={wid}
        objective={ws.objective}
        providers={providerStatus()}
        credits={credits}
        datasets={datasets}
        companies={companies}
        openDiscover={sp.new === "discover"}
        openJob={sp.job ?? null}
        jobs={jobs.map((j) => ({ id: j.id, scope: j.scope, status: j.status, total: j.totalTasks, completed: j.completedTasks, failed: j.failedTasks, creditsUsed: j.creditsUsed, budget: j.budgetCredits, createdAt: j.createdAt.toISOString(), objective: j.plan?.objective ?? "", monitoring: Boolean(j.monitoringRuleId) }))}
      />
    </div>
  );
}
