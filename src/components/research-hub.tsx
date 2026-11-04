"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Building2, Briefcase, CheckCircle2, Sparkles, Users } from "lucide-react";
import { planDiscovery, type PlanView } from "@/app/actions/research";
import { PlanReviewDialog, JobProgress, statusLabel } from "./plan-review";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "./ui/card";
import { Field, Input, Select, Textarea } from "./ui/input";
import { Dialog, DialogContent } from "./ui/dialog";
import { relativeTime } from "@/lib/utils";

type Job = { id: string; scope: string; status: string; total: number; completed: number; failed: number; creditsUsed: number; budget: number; createdAt: string; objective: string; monitoring: boolean };

export function ResearchHub({ workspaceId, objective, providers, credits, datasets, companies, jobs, openDiscover, openJob }: {
  workspaceId: string; objective: string; providers: { search: string | null; extract: string; llm: string | null; researchReady: boolean }; credits: { allowance: number; used: number; reserved: number; available: number };
  datasets: { id: string; name: string }[]; companies: { id: string; name: string }[]; jobs: Job[]; openDiscover: boolean; openJob: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"DISCOVER_COMPANIES" | "DISCOVER_CONTACTS" | "DISCOVER_OPPORTUNITIES">("DISCOVER_COMPANIES");
  const [text, setText] = useState(openDiscover ? objective : "");
  const [datasetId, setDatasetId] = useState("");
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [max, setMax] = useState(25);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [job, setJob] = useState<string | null>(openJob);

  function propose() {
    start(async () => {
      const r = await planDiscovery(workspaceId, { scope: kind, objective: text, datasetId: datasetId || null, companyId: kind === "DISCOVER_COMPANIES" ? null : companyId, maxResults: max });
      if (!r.ok) return void toast.error(r.error);
      setPlan(r.data);
    });
  }

  return (
    <div className="space-y-6">
      {!providers.researchReady ? (
        <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Live internet research is not configured</p>
            <p className="text-muted-foreground">Search: {providers.search ?? "missing"} · AI extraction: {providers.llm ?? "missing"} · Page reading: {providers.extract}. You can still draft plans and research manually. Careerly never shows simulated results.</p>
            <Link href="/app/settings" className="text-primary hover:underline">Configure providers</Link>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Start new research</CardTitle>
          <CardDescription>Describe what you want. Careerly proposes a plan; nothing runs until you approve it and its budget.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["DISCOVER_COMPANIES", Building2, "Discover employers", "Find employers that match your objective"],
              ["DISCOVER_OPPORTUNITIES", Briefcase, "Find opportunities", "Openings, graduate programmes, internships"],
              ["DISCOVER_CONTACTS", Users, "Find professionals", "Public profiles at a target employer"],
            ] as const).map(([k, Icon, title, desc]) => (
              <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={`rounded-lg border p-3 text-left transition ${kind === k ? "border-primary bg-accent/50" : "hover:bg-muted"}`}>
                <Icon className="size-4 text-primary" />
                <p className="mt-1.5 text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </button>
            ))}
          </div>
          {kind === "DISCOVER_COMPANIES" ? (
            <>
              <Field label="What are you looking for?" hint='e.g. "Find 50 companies recruiting junior consultants in Paris" or "Real estate investment funds offering analyst roles in Europe"'>
                <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={objective || "Find real estate investment funds offering analyst opportunities in Europe"} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Add results to">
                  <Select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
                    <option value="">A new table “Discovered employers”</option>
                    {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </Field>
                <Field label="Maximum employers"><Input type="number" min={1} max={100} value={max} onChange={(e) => setMax(Number(e.target.value))} /></Field>
              </div>
            </>
          ) : (
            <Field label="Employer" hint={companies.length ? undefined : "Add employers first (import or discover)."}>
              <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} disabled={!companies.length}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{credits.available} of {credits.allowance} credits available this month</p>
            <Button onClick={propose} disabled={pending || (kind === "DISCOVER_COMPANIES" ? (text || objective).length < 8 : !companyId)}>{pending ? "Planning…" : "Propose a plan"}</Button>
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Research history</h2>
        {jobs.length === 0 ? (
          <EmptyState title="No research yet">Approved research jobs appear here with progress, logs and credits used.</EmptyState>
        ) : (
          <Card className="divide-y">
            {jobs.map((j) => (
              <button key={j.id} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50" onClick={() => setJob(j.id)}>
                {j.status === "SUCCEEDED" ? <CheckCircle2 className="size-4 text-success" /> : <span className={`size-2 rounded-full ${j.status === "RUNNING" || j.status === "QUEUED" ? "animate-pulse bg-primary" : j.status === "FAILED" ? "bg-destructive" : "bg-warning"}`} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{j.objective.split("\n")[0] || j.scope}</span>
                  <span className="block text-xs text-muted-foreground">{j.scope.replace(/_/g, " ").toLowerCase()} · {j.completed}/{j.total} tasks{j.failed ? ` · ${j.failed} failed` : ""} · {j.creditsUsed}/{j.budget} credits · {relativeTime(j.createdAt)}</span>
                </span>
                {j.monitoring ? <Badge variant="outline">Monitoring</Badge> : null}
                <Badge variant={j.status === "SUCCEEDED" ? "success" : j.status === "FAILED" ? "danger" : j.status === "PARTIAL" ? "warning" : "primary"}>{statusLabel(j.status)}</Badge>
              </button>
            ))}
          </Card>
        )}
      </section>

      <PlanReviewDialog workspaceId={workspaceId} plan={plan} onClose={() => { setPlan(null); router.refresh(); }} />
      <Dialog open={!!job} onOpenChange={(o) => !o && setJob(null)}>
        {job ? <DialogContent wide title="Research job"><JobProgress workspaceId={workspaceId} jobId={job} onDone={() => router.refresh()} onClose={() => setJob(null)} /></DialogContent> : null}
      </Dialog>
    </div>
  );
}
