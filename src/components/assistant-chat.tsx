"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Bot, Send } from "lucide-react";
import { ask } from "@/app/actions/assistant";
import { Button } from "./ui/button";
import { Card, EmptyState } from "./ui/card";
import { Textarea } from "./ui/input";

const SUGGESTIONS = ["What should I prioritise this week?", "Which employers rank best for my profile, and why?", "What research is still missing?", "Show me new opportunities since Monday", "Compare my top three employers"];

export function AssistantChat({ workspaceId, configured }: { workspaceId: string; configured: boolean }) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  if (!configured) {
    return (
      <EmptyState icon={<Bot />} title="The assistant needs an AI provider" action={<Button asChild><Link href="/app/settings">Open settings</Link></Button>}>
        Add an Anthropic API key on the server to enable it. Everything else in Careerly works without it.
      </EmptyState>
    );
  }
  function send(text: string) {
    if (!text.trim()) return;
    const history = messages;
    setMessages([...history, { role: "user", content: text }]);
    setQ("");
    start(async () => {
      const r = await ask(workspaceId, text, history);
      if (!r.ok) {
        toast.error(r.error);
        setMessages(history);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: r.data.answer ?? "" }]);
    });
  }
  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <div className="flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">{s}</button>)}</div>
      ) : (
        <div className="space-y-3" aria-live="polite">
          {messages.map((m, i) => (
            <Card key={i} className={m.role === "user" ? "ml-10 bg-accent/40 p-3" : "mr-6 p-3"}>
              <p className="whitespace-pre-wrap text-sm">{m.content}</p>
            </Card>
          ))}
          {pending ? <p className="text-sm text-muted-foreground">Thinking…</p> : null}
        </div>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(q); }}>
        <Textarea rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about this search…" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(q); } }} aria-label="Question" />
        <Button type="submit" disabled={pending || !q.trim()} aria-label="Send"><Send /></Button>
      </form>
      <p className="text-xs text-muted-foreground">Each question uses 2 credits. The assistant does not browse the web; it suggests research you can launch.</p>
    </div>
  );
}
