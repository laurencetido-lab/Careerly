export class AppError extends Error {
  constructor(
    message: string,
    public code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "RATE_LIMITED" | "QUOTA" | "NOT_CONFIGURED" | "CONFLICT",
  ) {
    super(message);
  }
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Wrap a server action so expected errors become user-facing messages instead of crashes. */
export async function action<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e && typeof e === "object" && "issues" in e) {
      const issues = (e as { issues: { path: (string | number)[]; message: string }[] }).issues;
      return { ok: false, error: issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") };
    }
    // Next.js redirect / notFound must propagate
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
