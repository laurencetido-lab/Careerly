"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { cancelResearch, jobStatus, launchResearch, updatePlan, type PlanView } from "@/app/actions/research";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input, Textarea, Label } from "./ui/input";
import { Dialog, DialogContent } from "./ui/dialog";

const SCOPE_LABEL: Record<string, string> = {
  CELL: "One cell",
  ROW: "One row",
  ROWS: "Selected rows",
  COLUMN: "Whole column",
  DATASET: "Whole table",
  DISCOVER_COMPANIES: "Discover employers",
  DISCOVER_CONTACTS: "Find professionals",
  DISCOVER_OPPORTUNITIES: "Find opportunities",
};

export function PlanReviewDialog({ workspaceId, plan, onClose }: { workspaceId: string; plan: PlanView | null; onClose: () => void }) {
  return (
    <Dialog open={!!plan} onOpenChange={(o) => !o && onClose()}>
      {plan ? (
        <DialogContent wide title="Review research plan" description="Check what Careerly will search for. Edit anything, set a budget, then launch.">
          <PlanEditor key={plan.id} workspaceId={workspaceId} initial={plan} onClose={onClose} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function PlanEditor({ workspaceId, initial, onClose }: { workspaceId: string; initial: PlanView; onClose: () => void }) {
  const router = useRouter();
  const [plan, setPlan] = useState(initial);
  const [items, setItems] = useState(initial.items);
  const [budget, setBudget] = useState(Math.min(initial.estimatedCredits, Math.max(initial.credits.available, 1)));
  const [maxResults, setMaxResults] = useState(initial.maxResults);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [jobId, setJobId] = useState<string | null>(null);
  const discovery = plan.scope.startsWith("DISCOVER");

  const edit = (i: number, patch: Partial<(typeof items)[number]>) => {
    setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setDirty(true);
  };

  async function save() {
    const res = await updatePlan(workspaceId, plan.id, items, discovery ? maxResults : undefined);
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    setPlan(res.data);
    setItems(res.data.items);
    setDirty(false);
    return res.data;
  }

  function launch() {
    start(async () => {
      if (dirty && !(await save())) return;
      const res = await launchResearch(workspaceId, plan.id, budget);
      if (!res.ok) return void toast.error(res.error);
      setJobId(res.data.jobId);
      toast.success("Research started. It keeps running if you close this window.");
    });
  }

  if (jobId) return <JobProgress workspaceId={workspaceId} jobId={jobId} onDone={() => router.refresh()} onClose={onClose} />;

  const overBudget = budget > plan.credits.available;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="primary">{SCOPE_LABEL[plan.scope] ?? plan.scope}</Badge>
        {!discovery ? <Badge>{plan.rows} row{plan.rows === 1 ? "" : "s"} × {items.length} field{items.length === 1 ? "" : "s"}</Badge> : null}
        <Badge variant="outline">{plan.generatedBy === "AI" ? <><Sparkles className="size-3" /> Queries drafted by AI</> : "Template queries (AI not configured)"}</Badge>
      </div>
      {plan.objective ? <p className="whitespace-pre-line rounded-md bg-muted/50 p-3 text-sm">{plan.objective}</p> : null}

      {plan.readiness ? (
        <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Live research is not available yet</p>
            <p className="text-muted-foreground">{plan.readiness}</p>
            <p className="mt-1 text-muted-foreground">You can still research manually: open a row and use “Add a value with its source”.</p>
            <Link href="/app/settings" className="mt-1 inline-block text-primary hover:underline">Open research provider settings</Link>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={it.id} className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{it.fieldName ?? `Search ${i + 1}`}</p>
              {items.length > 1 ? (
                <button className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Remove from plan" onClick={() => { setItems(items.filter((_, j) => j !== i)); setDirty(true); }}>
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
            {!discovery ? (
              <>
                <Label className="text-xs text-muted-foreground">Instruction</Label>
                <Textarea rows={2} className="mt-1" value={it.instruction} onChange={(e) => edit(i, { instruction: e.target.value })} />
                <Label className="mt-2 block text-xs text-muted-foreground">Search queries ({"{entity}"} is replaced by each employer name)</Label>
                <div className="mt-1 space-y-1.5">
                  {it.queries.map((q, k) => (
                    <div key={k} className="flex gap-1.5">
                      <Input className="h-8 font-mono text-xs" value={q} onChange={(e) => edit(i, { queries: it.queries.map((x, z) => (z === k ? e.target.value : x)) })} />
                      {it.queries.length > 1 ? <Button size="icon" variant="ghost" aria-label="Remove query" onClick={() => edit(i, { queries: it.queries.filter((_, z) => z !== k) })}><X /></Button> : null}
                    </div>
                  ))}
                  {it.queries.length < 5 ? <Button size="sm" variant="ghost" onClick={() => edit(i, { queries: [...it.queries, "{entity} "] })}><Plus /> Add query</Button> : null}
                </div>
              </>
            ) : (
              <Input className="h-8 font-mono text-xs" value={it.queries[0] ?? it.instruction} onChange={(e) => edit(i, { queries: [e.target.value], instruction: e.target.value })} />
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Estimated cost (upper bound)</p>
          <p className="text-lg font-semibold">{plan.estimatedCredits} credits</p>
          {dirty ? <button className="text-xs text-primary hover:underline" onClick={() => start(async () => void (await save()))}>Recalculate</button> : <p className="text-xs text-muted-foreground">Cached results cost nothing.</p>}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Available this month</p>
          <p className="text-lg font-semibold">{plan.credits.available}</p>
          <p className="text-xs text-muted-foreground">{plan.credits.used} used · {plan.credits.reserved} reserved</p>
        </div>
        <div className="space-y-2">
          <div>
            <Label htmlFor="budget" className="text-xs text-muted-foreground">Approved budget</Label>
            <Input id="budget" type="number" min={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="mt-1 h-8" />
            {overBudget ? <p className="mt-1 text-xs text-destructive">More than your available credits.</p> : <p className="mt-1 text-xs text-muted-foreground">Research stops when this is reached.</p>}
          </div>
          {discovery ? (
            <div>
              <Label htmlFor="max" className="text-xs text-muted-foreground">Max results</Label>
              <Input id="max" type="number" min={1} max={100} value={maxResults} onChange={(e) => { setMaxResults(Number(e.target.value)); setDirty(true); }} className="mt-1 h-8" />
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={launch} disabled={pending || !!plan.readiness || overBudget || budget < 1}>
          {pending ? <Loader2 className="animate-spin" /> : null} Approve &amp; launch
        </Button>
      </div>
    </div>
  );
}

export function JobProgress({ workspaceId, jobId, onDone, onClose }: { workspaceId: string; jobId: string; onDone?: () => void; onClose?: () => void }) {
  const [s, setS] = useState<Awaited<ReturnType<typeof jobStatus>> | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const r = await jobStatus(workspaceId, jobId);
      if (!alive) return;
      setS(r);
      if (r.ok && ["QUEUED", "RUNNING"].includes(r.data.status)) timer = setTimeout(tick, 2000);
      else onDone?.();
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [workspaceId, jobId, onDone]);
  const d = s?.ok ? s.data : null;
  const pct = d && d.total ? Math.round(((d.completed + d.failed) / d.total) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{d ? statusLabel(d.status) : "Starting…"}</span>
        <span className="text-muted-foreground">{d ? `${d.completed + d.failed}/${d.total} tasks · ${d.creditsUsed}/${d.budget} credits` : ""}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      {d?.error ? <p className="text-sm text-warning">{d.error}</p> : null}
      <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-[11px]">
        {d?.logs.length ? d.logs.map((l) => <p key={l.id} className={l.level === "error" ? "text-destructive" : l.level === "warn" ? "text-warning" : "text-muted-foreground"}>{l.message}</p>) : <p className="text-muted-foreground">Waiting for the worker…</p>}
      </div>
      <div className="flex justify-end gap-2">
        {d && ["QUEUED", "RUNNING"].includes(d.status) ? <Button variant="outline" onClick={() => cancelResearch(workspaceId, jobId)}>Cancel job</Button> : null}
        {onClose ? <Button variant="secondary" onClick={onClose}>Close</Button> : null}
      </div>
    </div>
  );
}

export function statusLabel(s: string) {
  return ({ QUEUED: "Queued", RUNNING: "Researching…", SUCCEEDED: "Finished", PARTIAL: "Partly finished", FAILED: "Failed", CANCELLED: "Cancelled" } as Record<string, string>)[s] ?? s;
}
