import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { PageHeader } from "@/components/page-header";
import { CompensationView } from "@/components/compensation";

export const metadata = { title: "Compensation" };

export default async function CompensationPage({ params }: { params: Promise<{ wid: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  await requireWorkspace(user.id, wid);
  const records = await db.compensationRecord.findMany({ where: { workspaceId: wid }, orderBy: [{ year: "desc" }, { createdAt: "desc" }], include: { company: true } });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Compensation" description="Compare like with like: charts only show one currency, year and seniority at a time." />
      <CompensationView
        workspaceId={wid}
        records={records.map((r) => ({ id: r.id, company: r.company?.name ?? "—", roleTitle: r.roleTitle, seniority: r.seniority, city: r.city, country: r.country, year: r.year, currency: r.currency, base: r.baseSalary, targetBonus: r.targetBonus, actualBonus: r.actualBonus, signing: r.signingBonus, lti: r.longTermIncentive, carry: r.carriedInterest, sourceType: r.sourceType, confidence: r.confidence, sourceUrl: r.sourceUrl, notes: r.notes, isPrivate: r.isPrivate }))}
      />
    </div>
  );
}
