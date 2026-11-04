"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { endSession, requireUser } from "@/server/auth";
import { action, AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { deleteObject } from "@/server/storage";

const PrefSchema = z.object({
  name: z.string().trim().min(1).max(100),
  locale: z.enum(["en", "fr"]),
  networkingLanguage: z.enum(["en", "fr", "de", "es", "it", "nl", "pt"]),
  timezone: z.string().max(60),
  currency: z.string().length(3),
  dateFormat: z.enum(["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"]),
  emailNotifications: z.boolean(),
});

export async function savePreferences(input: unknown) {
  return action(async () => {
    const user = await requireUser();
    const d = PrefSchema.parse(input);
    try {
      new Intl.DateTimeFormat("en", { timeZone: d.timezone });
    } catch {
      throw new AppError("Unknown time zone.", "INVALID");
    }
    await db.user.update({ where: { id: user.id }, data: { ...d, currency: d.currency.toUpperCase() } });
    revalidatePath("/app", "layout");
    return null;
  });
}

export async function setAiConsent(consent: boolean) {
  return action(async () => {
    const user = await requireUser();
    await db.user.update({ where: { id: user.id }, data: { aiConsentAt: consent ? new Date() : null } });
    await audit({ userId: user.id, action: consent ? "consent.ai.granted" : "consent.ai.withdrawn" });
    revalidatePath("/app/settings");
    return null;
  });
}

export async function markNotificationsRead(ids?: string[]) {
  return action(async () => {
    const user = await requireUser();
    await db.notification.updateMany({ where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
    revalidatePath("/app", "layout");
    return null;
  });
}

export async function deleteAccount(password: string) {
  const res = await action(async () => {
    const user = await requireUser();
    if (!(await bcrypt.compare(password, user.passwordHash))) throw new AppError("Password is incorrect.", "INVALID");
    const files = await db.uploadedFile.findMany({ where: { userId: user.id } });
    for (const f of files) await deleteObject(f.storageKey);
    await audit({ userId: null, action: "account.delete", detail: `user ${user.id}` });
    await db.user.delete({ where: { id: user.id } }); // cascades to workspaces, data, sessions
    return null;
  });
  if (!res.ok) return res;
  await endSession();
  redirect("/?deleted=1");
}
