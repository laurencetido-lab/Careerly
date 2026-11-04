"use server";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { action } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { assertCreditsAvailable } from "@/server/credits";
import { askAssistant } from "@/server/assistant";

export async function ask(workspaceId: string, question: string, history: unknown) {
  return action(async () => {
    const user = await requireUser();
    const ws = await requireWorkspace(user.id, workspaceId);
    rateLimit(`assistant:${user.id}`, 15, 60_000);
    const q = z.string().trim().min(2).max(2000).parse(question);
    const h = z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(20).parse(history);
    await assertCreditsAvailable(user.id, 2);
    return askAssistant(user, ws, q, h);
  });
}
