import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { PageHeader } from "@/components/page-header";
import { OpportunitiesView } from "@/components/opportunities";

export const metadata = { title: "Opportunities" };

export default async function OpportunitiesPage({ params }: { params: Promise<{ wid: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  await requireWorkspace(user.id, wid);
  const opps = await db.opportunity.findMany({ where: { workspaceId: wid }, orderBy: [{ status: "asc" }, { deadline: "asc" }], include: { company: true, _count: { select: { applications: true, evidence: true } }, evidence: { include: { source: true }, take: 1, orderBy: { createdAt: "desc" } } } });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Opportunities" description="Graduate programmes, convertible internships and permanent roles. A role is only marked open when an official source currently shows it." />
      <OpportunitiesView
        workspaceId={wid}
        items={opps.map((o) => ({
          id: o.id, title: o.title, company: o.company?.name ?? null, location: o.location, pipeline: o.pipeline, status: o.status, employmentType: o.employmentType,
          deadline: o.deadline?.toISOString() ?? null, startDate: o.startDate, salary: o.salaryText, url: o.applicationUrl, sourceUrl: o.sourceUrl, lastVerifiedAt: o.lastVerifiedAt?.toISOString() ?? null,
          firstDiscoveredAt: o.firstDiscoveredAt.toISOString(), applications: o._count.applications, excerpt: o.evidence[0]?.excerpt ?? null, conversion: o.conversionEvidence, origin: o.origin,
        }))}
      />
    </div>
  );
}
