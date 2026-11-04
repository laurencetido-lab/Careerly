import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { PageHeader } from "@/components/page-header";
import { ApplicationsBoard } from "@/components/applications-board";

export const metadata = { title: "Applications" };

export default async function ApplicationsPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<{ app?: string }> }) {
  const user = await requireUserPage();
  const { wid } = await params;
  const { app } = await searchParams;
  await requireWorkspace(user.id, wid);
  const [stages, apps, companies, contacts] = await Promise.all([
    db.pipelineStage.findMany({ where: { workspaceId: wid }, orderBy: { position: "asc" } }),
    db.application.findMany({ where: { workspaceId: wid }, orderBy: { updatedAt: "desc" }, include: { company: true, recruiter: true, interviews: { orderBy: { scheduledAt: "asc" } } } }),
    db.company.findMany({ where: { workspaceId: wid }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.contact.findMany({ where: { workspaceId: wid }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);
  const ser = (d: Date | null) => d?.toISOString() ?? null;
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Applications" description="Track every application from research to offer. Drag cards between stages." />
      <ApplicationsBoard
        workspaceId={wid}
        openId={app ?? null}
        stages={stages.map((s) => ({ key: s.key, label: s.label }))}
        companies={companies}
        contacts={contacts}
        apps={apps.map((a) => ({
          id: a.id, role: a.role, stage: a.stage, company: a.company?.name ?? null, companyId: a.companyId, recruiterId: a.recruiterId, recruiter: a.recruiter?.fullName ?? null,
          applicationUrl: a.applicationUrl, appliedAt: ser(a.appliedAt), deadline: ser(a.deadline), cvVersion: a.cvVersion, coverLetter: a.coverLetter, tests: a.tests, feedback: a.feedback,
          compensationNote: a.compensationNote, nextAction: a.nextAction, nextActionAt: ser(a.nextActionAt),
          interviews: a.interviews.map((i) => ({ id: i.id, round: i.round, scheduledAt: ser(i.scheduledAt), format: i.format, questions: i.questions, preparedAnswers: i.preparedAnswers, notes: i.notes, feedback: i.feedback, prepProgress: i.prepProgress })),
        }))}
      />
    </div>
  );
}
