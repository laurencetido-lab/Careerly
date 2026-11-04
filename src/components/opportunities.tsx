"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, FolderKanban, Plus } from "lucide-react";
import { createApplication, createOpportunity, updateOpportunity } from "@/app/actions/applications";
import { OPP_STATUS, PIPELINES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, EmptyState } from "./ui/card";
import { Dialog, DialogContent } from "./ui/dialog";
import { Field, Input, Select, Textarea } from "./ui/input";

type Opp = { id: string; title: string; company: string | null; location: string | null; pipeline: string; status: string; employmentType: string | null; deadline: string | null; startDate: string | null; salary: string | null; url: string | null; sourceUrl: string | null; lastVerifiedAt: string | null; firstDiscoveredAt: string; applications: number; excerpt: string | null; conversion: string | null; origin: string };

export function OpportunitiesView({ workspaceId, items }: { workspaceId: string; items: Opp[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<string>("ALL");
  const [status, setStatus] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const list = items.filter((o) => (tab === "ALL" || o.pipeline === tab) && (!status || o.status === status));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border p-1" role="tablist">
          {[["ALL", "All"], ...Object.entries(PIPELINES)].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-md px-2.5 py-1 text-sm ${tab === k ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}>
              {l} <span className="text-xs text-muted-foreground">{items.filter((o) => k === "ALL" || o.pipeline === k).length}</span>
            </button>
          ))}
        </div>
        <Select className="h-9 w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="">Any status</option>
          {Object.entries(OPP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Button className="ml-auto" size="sm" onClick={() => setOpen(true)}><Plus /> Add manually</Button>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No opportunities here yet">Open an employer and choose <b>Find jobs</b>, use <b>Research → Find opportunities</b>, or add one you found yourself.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{o.title}</p>
                  <p className="text-sm text-muted-foreground">{[o.company, o.location, o.employmentType].filter(Boolean).join(" · ")}</p>
                </div>
                <Badge variant={OPP_STATUS[o.status].tone}>{OPP_STATUS[o.status].label}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <Badge variant="outline">{PIPELINES[o.pipeline]}</Badge>
                {o.deadline ? <Badge variant="warning">Deadline {formatDate(o.deadline)}</Badge> : null}
                {o.startDate ? <Badge>Start {o.startDate}</Badge> : null}
                {o.salary ? <Badge>{o.salary}</Badge> : null}
              </div>
              {o.excerpt ? <blockquote className="mt-2 line-clamp-3 border-l-2 pl-2 text-xs italic text-muted-foreground">“{o.excerpt}”</blockquote> : null}
              {o.conversion ? <p className="mt-2 text-xs"><b>Conversion evidence:</b> {o.conversion}</p> : null}
              <p className="mt-2 text-[11px] text-muted-foreground">
                {o.origin === "MANUAL" ? "Added by you" : `First found ${formatDate(o.firstDiscoveredAt)}`}{o.lastVerifiedAt ? ` · verified open ${formatDate(o.lastVerifiedAt)}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {o.url ? <Button size="sm" variant="outline" asChild><a href={o.url} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink /> Official page</a></Button> : null}
                <Button size="sm" variant={o.applications ? "ghost" : "secondary"} disabled={pending} onClick={() => start(async () => { const r = await createApplication(workspaceId, { opportunityId: o.id, role: "" }); if (!r.ok) toast.error(r.error); else { toast.success("Added to applications"); router.push(`/app/w/${workspaceId}/applications`); } })}>
                  <FolderKanban /> {o.applications ? `Tracked (${o.applications})` : "Track application"}
                </Button>
                <Select className="h-8 w-auto text-xs" value={o.status} aria-label="Update status" onChange={(e) => start(async () => { const r = await updateOpportunity(workspaceId, o.id, { status: e.target.value }); if (!r.ok) toast.error(r.error); router.refresh(); })}>
                  {Object.entries(OPP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add an opportunity" description="Record an opening you found. Its status stays “unknown” until you confirm it.">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); start(async () => {
            const r = await createOpportunity(workspaceId, { companyName: f.get("company"), title: f.get("title"), location: f.get("location") || null, pipeline: f.get("pipeline"), employmentType: f.get("type") || null, deadline: f.get("deadline") || null, applicationUrl: f.get("url") || null, salaryText: f.get("salary") || null, conversionEvidence: f.get("conversion") || null });
            if (!r.ok) return void toast.error(r.error);
            setOpen(false); router.refresh();
          }); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Employer"><Input name="company" required /></Field>
              <Field label="Role title"><Input name="title" required /></Field>
              <Field label="Location"><Input name="location" /></Field>
              <Field label="Pipeline"><Select name="pipeline">{Object.entries(PIPELINES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="Employment type"><Input name="type" placeholder="Full-time, 6-month internship…" /></Field>
              <Field label="Deadline"><Input name="deadline" type="date" /></Field>
              <Field label="Application URL"><Input name="url" type="url" /></Field>
              <Field label="Salary (if stated)"><Input name="salary" /></Field>
            </div>
            <Field label="Conversion evidence (internships)"><Textarea name="conversion" rows={2} placeholder="Only what a source or a contact actually said" /></Field>
            <div className="flex justify-end"><Button type="submit" disabled={pending}>Add opportunity</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
