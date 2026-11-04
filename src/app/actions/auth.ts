"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { clientIp, endSession, getCurrentUser, startSession } from "@/server/auth";
import { rateLimit } from "@/server/ratelimit";
import { audit } from "@/server/audit";
import { AppError } from "@/server/errors";

export type AuthState = { error?: string } | undefined;

const SignupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  privacy: z.literal("on", { message: "Please accept the privacy notice" }),
});

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  try {
    rateLimit(`signup:${(await clientIp()) ?? "?"}`, 5, 60_000);
    const parsed = SignupSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const { name, email, password } = parsed.data;
    const exists = await db.user.findUnique({ where: { email } });
    if (exists) return { error: "An account with this email already exists. Sign in instead." };
    const user = await db.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 12) } });
    await audit({ userId: user.id, action: "auth.signup", ip: await clientIp() });
    await startSession(user.id);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  redirect("/app/onboarding");
}

const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO5b8Tq9Gq0p9x0bJ4y5tYlq1fV8b0Sxe";

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  let next = "/app";
  try {
    const ip = (await clientIp()) ?? "?";
    rateLimit(`login:${ip}`, 10, 60_000);
    const parsed = LoginSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: "Enter your email and password." };
    rateLimit(`login:${parsed.data.email}`, 8, 5 * 60_000);
    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      await audit({ userId: user?.id, action: "auth.login_failed", ip });
      return { error: "Email or password is incorrect." };
    }
    await audit({ userId: user.id, action: "auth.login", ip });
    await startSession(user.id);
    const n = form.get("next");
    if (typeof n === "string" && n.startsWith("/app") && !n.startsWith("//")) next = n;
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  redirect(next);
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) await audit({ userId: user.id, action: "auth.logout" });
  await endSession();
  redirect("/login");
}
