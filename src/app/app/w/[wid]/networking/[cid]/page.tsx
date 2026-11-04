import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { providerStatus } from "@/server/providers";
import { ContactDetail } from "@/components/contact-detail";

export default async function ContactPage({ params }: { params: Promise<{ wid: string; cid: string }> }) {
  const user = await requireUserPage();
  const { wid, cid } = await params;
  await requireWorkspace(user.id, wid);
  const c = await db.contact.findFirst({ where: { id: cid, workspaceId: wid }, include: { company: true, interactions: { orderBy: { occurredAt: "desc" } }, drafts: { orderBy: { createdAt: "desc" }, take: 10 } } });
  if (!c) notFound();
  const profile = await db.userProfile.findUnique({ where: { userId: user.id } });
  return (
    <ContactDetail
      workspaceId={wid}
      aiConfigured={Boolean(providerStatus().llm)}
      aiConsent={Boolean(user.aiConsentAt)}
      profileConfirmed={Boolean(profile?.confirmedAt)}
      defaultLanguage={user.networkingLanguage}
      contact={{
        id: c.id, fullName: c.fullName, title: c.title, team: c.team, location: c.location, company: c.company?.name ?? null, profileUrl: c.profileUrl, sourceUrl: c.sourceUrl, sourceExcerpt: c.sourceExcerpt,
        verifiedAt: c.verifiedAt?.toISOString() ?? null, reason: c.recommendationReason, score: c.relevanceScore, stage: c.stage, alumniOf: c.alumniOf, isRecruiter: c.isRecruiter, privateNotes: c.privateNotes, origin: c.origin,
      }}
      interactions={c.interactions.map((i) => ({ id: i.id, type: i.type, occurredAt: i.occurredAt.toISOString(), summary: i.summary, salaryInsight: i.salaryInsight, recruitmentInsight: i.recruitmentInsight, careerInsight: i.careerInsight, nextAction: i.nextAction, followUpAt: i.followUpAt?.toISOString() ?? null, followUpDone: i.followUpDone }))}
      drafts={c.drafts.map((d) => ({ id: d.id, purpose: d.purpose, tone: d.tone, body: d.body, generatedBy: d.generatedBy, createdAt: d.createdAt.toISOString() }))}
    />
  );
}
