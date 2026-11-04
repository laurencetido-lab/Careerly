import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { AppError } from "./errors";
import { createSessionToken, hashToken, SESSION_TTL_MS } from "./session-token";

export const SESSION_COOKIE = "careerly_session";

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

export async function startSession(userId: string) {
  const token = createSessionToken();
  const h = await headers();
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ip: await clientIp(),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Secure whenever the request reached us over HTTPS (directly or via a proxy)
    secure: (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https" || (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

/** For server components / pages: redirect to login when unauthenticated. */
export async function requireUserPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For actions / route handlers: throw instead of redirecting. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new AppError("Please sign in again.", "UNAUTHENTICATED");
  return user;
}
