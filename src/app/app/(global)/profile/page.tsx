import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { providerStatus } from "@/server/providers";
import { PageHeader } from "@/components/page-header";
import { ProfileEditor } from "@/components/profile-editor";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUserPage();
  const p = await db.userProfile.findUnique({ where: { userId: user.id }, include: { education: { orderBy: { position: "asc" } }, experience: { orderBy: { position: "asc" } } } });
  const cv = p?.cvFileId ? await db.uploadedFile.findUnique({ where: { id: p.cvFileId } }) : null;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Your profile" description="Used to personalise matching and messages. Careerly only uses what you confirm here, and never invents experience." />
      <ProfileEditor
        aiConsent={Boolean(user.aiConsentAt)}
        aiConfigured={Boolean(providerStatus().llm)}
        cv={cv ? { id: cv.id, name: cv.originalName } : null}
        confirmedAt={p?.confirmedAt?.toISOString() ?? null}
        initial={{
          headline: p?.headline ?? null,
          graduationDate: p?.graduationDate?.toISOString().slice(0, 7) ?? null,
          availability: p?.availability ?? null,
          skills: p?.skills ?? [], languages: p?.languages ?? [], preferredLocations: p?.preferredLocations ?? [], careerInterests: p?.careerInterests ?? [], achievements: p?.achievements ?? [],
          education: p?.education.map((e) => ({ institution: e.institution, degree: e.degree, field: e.field, startDate: e.startDate, endDate: e.endDate })) ?? [],
          experience: p?.experience.map((e) => ({ employer: e.employer, title: e.title, location: e.location, startDate: e.startDate, endDate: e.endDate, summary: e.summary })) ?? [],
        }}
      />
    </div>
  );
}
