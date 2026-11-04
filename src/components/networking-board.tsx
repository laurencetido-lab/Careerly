"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, LayoutGrid, List, Plus, Sparkles } from "lucide-react";
import { createContact, updateContact } from "@/app/actions/networking";
import { planDiscovery, type PlanView } from "@/app/actions/research";
import { CONTACT_STAGES } from "@/lib/constants";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, EmptyState } from "./ui/card";
import { Dialog, DialogContent } from "./ui/dialog";
import { Field, Input, Select } from "./ui/input";
import { PlanReviewDialog } from "./plan-review";
import { cn } from "@/lib/utils";

type C = { id: string; fullName: string; title: string | null; company: string | null; companyId: string | null; location: string | null; stage: string; score: number; reason: string | null; origin: string; profileUrl: string | null; interactions: number };

export function NetworkingBoard({ workspaceId, contacts, companies, initialCompany }: { workspaceId: string; contacts: C[]; companies: { id: string; name: string }[]; initialCompany: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"board" | "list">("board");
  const [company, setCompany] = useState(initialCompany);
  const [add, setAdd] = useState(false);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = contacts.filter((c) => !company || c.companyId === company);

  const move = (id: string, stage: string) => start(async () => { const r = await updateContact(workspaceId, id, { stage }); if (!r.ok) toast.error(r.error); router.refresh(); });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-auto" value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Filter by employer">
          <option value="">All employers</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <div className="flex rounded-md border p-0.5">
          <button className={cn("rounded px-2 py-1", mode === "board" && "bg-muted")} onClick={() => setMode("board")} aria-label="Board view"><LayoutGrid className="size-4" /></button>
          <button className={cn("rounded px-2 py-1", mode === "list" && "bg-muted")} onClick={() => setMode("list")} aria-label="List view"><List className="size-4" /></button>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={!company || pending} title={company ? "" : "Choose an employer first"} onClick={() => start(async () => { const r = await planDiscovery(workspaceId, { scope: "DISCOVER_CONTACTS", objective: "", companyId: company, maxResults: 15 }); if (!r.ok) toast.error(r.error); else setPlan(r.data); })}>
            <Sparkles /> Find professionals
          </Button>
          <Button size="sm" onClick={() => setAdd(true)}><Plus /> Add contact</Button>
        </div>
      </div>
      {contacts.length === 0 ? (
        <EmptyState title="No contacts yet" action={<Button onClick={() => setAdd(true)}><Plus /> Add someone you know</Button>}>
          Choose an employer above and click <b>Find professionals</b> to discover public profiles, or add people you already know.
        </EmptyState>
      ) : mode === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {CONTACT_STAGES.map(([key, label]) => {
            const col = list.filter((c) => c.stage === key);
            return (
              <div key={key} className={cn("w-64 shrink-0 rounded-lg bg-muted/40 p-2", dragging && "outline-dashed outline-1 outline-border")} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragging) move(dragging, key); setDragging(null); }}>
                <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">{label} · {col.length}</p>
                <div className="space-y-2">
                  {col.map((c) => (
                    <Card key={c.id} draggable onDragStart={() => setDragging(c.id)} className="cursor-grab p-2.5 active:cursor-grabbing">
                      <Link href={`/app/w/${workspaceId}/networking/${c.id}`} className="block">
                        <p className="text-sm font-medium">{c.fullName}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.title ?? "Title not verified"}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.company}</p>
                      </Link>
                      <div className="mt-1.5 flex items-center justify-between">
                        <Badge variant="primary" title={c.reason ?? ""}>Relevance {c.score}</Badge>
                        <Select className="h-6 w-24 px-1 text-[11px]" value={c.stage} onChange={(e) => move(c.id, e.target.value)} aria-label="Move to stage">
                          {CONTACT_STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </Select>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="divide-y">
          {list.map((c) => (
            <div key={c.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <Link href={`/app/w/${workspaceId}/networking/${c.id}`} className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.fullName} <span className="font-normal text-muted-foreground">· {c.title ?? "title not verified"}{c.company ? ` · ${c.company}` : ""}</span></p>
                <p className="truncate text-xs text-muted-foreground">{c.reason}</p>
              </Link>
              <div className="flex items-center gap-2">
                {c.profileUrl ? <a href={c.profileUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-muted-foreground hover:text-foreground" aria-label="Public profile"><ExternalLink className="size-4" /></a> : null}
                <Badge variant="primary">{c.score}</Badge>
                <Badge>{CONTACT_STAGES.find(([k]) => k === c.stage)?.[1]}</Badge>
              </div>
            </div>
          ))}
        </Card>
      )}
      <Dialog open={add} onOpenChange={setAdd}>
        <DialogContent title="Add a contact" description="Store only what you need. Private notes stay private and are never used in research.">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); start(async () => {
            const r = await createContact(workspaceId, { fullName: f.get("name"), companyId: f.get("company") || null, title: f.get("title") || null, location: f.get("location") || null, profileUrl: f.get("url") || null, alumniOf: f.get("alumni") || null, isRecruiter: f.get("recruiter") === "on" });
            if (!r.ok) return void toast.error(r.error);
            setAdd(false);
            router.push(`/app/w/${workspaceId}/networking/${r.data.id}`);
          }); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name"><Input name="name" required /></Field>
              <Field label="Employer"><Select name="company" defaultValue={company}><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Job title"><Input name="title" /></Field>
              <Field label="Location"><Input name="location" /></Field>
              <Field label="Public profile URL"><Input name="url" type="url" /></Field>
              <Field label="Shared school (only if you know it)" hint="Used in messages only because you confirmed it."><Input name="alumni" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="recruiter" /> Works in recruitment / HR</label>
            <div className="flex justify-end"><Button type="submit" disabled={pending}>Add contact</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <PlanReviewDialog workspaceId={workspaceId} plan={plan} onClose={() => { setPlan(null); router.refresh(); }} />
    </div>
  );
}
