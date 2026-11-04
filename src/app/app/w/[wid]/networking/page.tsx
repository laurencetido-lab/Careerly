import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { PageHeader } from "@/components/page-header";
import { NetworkingBoard } from "@/components/networking-board";

export const metadata = { title: "Networking" };

export default async function NetworkingPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<{ company?: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  const { company } = await searchParams;
  await requireWorkspace(user.id, wid);
  const [contacts, companies, dueFollowUps] = await Promise.all([
    db.contact.findMany({ where: { workspaceId: wid }, orderBy: [{ relevanceScore: "desc" }, { createdAt: "desc" }], include: { company: true, _count: { select: { interactions: true } } } }),
    db.company.findMany({ where: { workspaceId: wid }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.networkingInteraction.count({ where: { workspaceId: wid, followUpDone: false, followUpAt: { lte: new Date() } } }),
  ]);
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Networking" description={<>Public professionals at your target employers and your relationship history.{dueFollowUps ? <b className="ml-1 text-warning">{dueFollowUps} follow-up{dueFollowUps > 1 ? "s" : ""} due.</b> : null}</>} />
      <NetworkingBoard
        workspaceId={wid}
        companies={companies}
        initialCompany={company ?? ""}
        contacts={contacts.map((c) => ({ id: c.id, fullName: c.fullName, title: c.title, company: c.company?.name ?? null, companyId: c.companyId, location: c.location, stage: c.stage, score: c.relevanceScore, reason: c.recommendationReason, origin: c.origin, profileUrl: c.profileUrl, interactions: c._count.interactions }))}
      />
    </div>
  );
}
