"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { action, AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { rateLimit } from "@/server/ratelimit";
import { deleteObject, putObject } from "@/server/storage";
import { mimeFor, validateUpload } from "@/server/files";
import { cvText, extractProfile } from "@/server/cv";
import { ProviderError } from "@/server/providers/types";

export async function uploadCv(form: FormData) {
  return action(async () => {
    const user = await requireUser();
    rateLimit(`cv:${user.id}`, 10, 60_000);
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Choose your CV file.", "INVALID");
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = validateUpload(file.name, buf, "CV");
    let text: string;
    try {
      text = await cvText(buf, ext);
    } catch {
      throw new AppError("We could not read text from this file. Try exporting it again as PDF or DOCX.", "INVALID");
    }
    if (text.trim().length < 50) throw new AppError("This CV appears to contain no selectable text (it may be a scanned image).", "INVALID");
    const { key, sha256 } = await putObject(buf);
    const rec = await db.uploadedFile.create({ data: { userId: user.id, kind: "CV", originalName: file.name.slice(0, 200), mimeType: mimeFor(ext), sizeBytes: buf.length, storageKey: key, sha256 } });
    const old = await db.userProfile.findUnique({ where: { userId: user.id } });
    await db.userProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, cvFileId: rec.id }, update: { cvFileId: rec.id } });
    if (old?.cvFileId) {
      const prev = await db.uploadedFile.findUnique({ where: { id: old.cvFileId } });
      if (prev) {
        await deleteObject(prev.storageKey);
        await db.uploadedFile.delete({ where: { id: prev.id } });
      }
    }
    let extracted;
    try {
      extracted = await extractProfile(text, Boolean(user.aiConsentAt));
    } catch (e) {
      if (!(e instanceof ProviderError)) throw e;
      extracted = await extractProfile(text, false);
    }
    if (extracted.method === "AI") await db.usageRecord.create({ data: { userId: user.id, kind: "LLM", provider: "anthropic", credits: 2 } });
    await audit({ userId: user.id, action: "cv.upload", detail: `${file.name} · extraction ${extracted.method}` });
    return extracted;
  });
}

const str = (n: number) => z.string().trim().max(n);
const ProfileSchema = z.object({
  headline: str(200).nullable(),
  graduationDate: z.string().max(20).nullable(),
  availability: str(200).nullable(),
  skills: z.array(str(60)).max(60),
  languages: z.array(str(60)).max(15),
  preferredLocations: z.array(str(80)).max(15),
  careerInterests: z.array(str(120)).max(20),
  achievements: z.array(str(300)).max(20),
  education: z.array(z.object({ institution: str(200).min(1), degree: str(200).nullable(), field: str(200).nullable(), startDate: str(30).nullable(), endDate: str(30).nullable() })).max(10),
  experience: z.array(z.object({ employer: str(200).min(1), title: str(200).nullable(), location: str(120).nullable(), startDate: str(30).nullable(), endDate: str(30).nullable(), summary: str(2000).nullable() })).max(20),
});

function parseGrad(s: string | null) {
  if (!s) return null;
  const m = s.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  return m ? new Date(Date.UTC(+m[1], m[2] ? +m[2] - 1 : 5, m[3] ? +m[3] : 1)) : null;
}

/** Save the profile the user reviewed. Only confirmed profiles are used for personalisation. */
export async function saveProfile(input: unknown) {
  return action(async () => {
    const user = await requireUser();
    const d = ProfileSchema.parse(input);
    const { education, experience, graduationDate, ...rest } = d;
    const profile = await db.userProfile.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
    await db.$transaction([
      db.profileEducation.deleteMany({ where: { profileId: profile.id } }),
      db.profileExperience.deleteMany({ where: { profileId: profile.id } }),
      db.userProfile.update({
        where: { id: profile.id },
        data: {
          ...rest,
          graduationDate: parseGrad(graduationDate),
          confirmedAt: new Date(),
          education: { create: education.map((e, i) => ({ ...e, position: i })) },
          experience: { create: experience.map((e, i) => ({ ...e, position: i })) },
        },
      }),
    ]);
    revalidatePath("/app/profile");
    return null;
  });
}
