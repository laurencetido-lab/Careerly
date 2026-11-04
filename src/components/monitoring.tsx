"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Play, Plus, Trash2 } from "lucide-react";
import { createMonitoringRule, deleteMonitoringRule, updateMonitoringRule } from "@/app/actions/intel";
import { formatDate } from "@/lib/utils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, EmptyState } from "./ui/card";
import { Field, Input, Select } from "./ui/input";

type DS = { id: string; name: string; rows: number; fields: { id: string; name: string; ai: boolean }[] };
type Rule = { id: string; name: string; dataset: string; fields: string[]; frequency: string; intervalDays: number; cap: number; enabled: boolean; lastRunAt: string | null; nextRunAt: string };

export function MonitoringView({ workspaceId, datasets, rules, researchReady }: { workspaceId: string; datasets: DS[]; rules: Rule[]; researchReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ds, setDs] = useState(datasets[0]?.id ?? "");
  const current = datasets.find((d) => d.id === ds);
  const [fields, setFields] = useState<string[]>(current?.fields.filter((f) => f.ai).map((f) => f.id) ?? []);
  const [frequency, setFrequency] = useState("WEEKLY");
  const [interval, setInterval] = useState(14);
  const [cap, setCap] = useState(100);
  const [name, setName] = useState("Weekly refresh");
  const perRun = (current?.rows ?? 0) * fields.length * 6;

  return (
    <div className="space-y-5">
      {!researchReady ? <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 text-warning" /> Research providers are not configured, so scheduled runs will be skipped (you will be notified) until they are.</div> : null}
      <Card>
        <CardHeader><CardTitle>New monitoring rule</CardTitle><CardDescription>Choose what to re-check and how often. Each run is capped by the credit limit you set.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {!datasets.length ? <p className="text-sm text-muted-foreground">Create a table first.</p> : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="Table"><Select value={ds} onChange={(e) => { setDs(e.target.value); setFields(datasets.find((d) => d.id === e.target.value)?.fields.filter((f) => f.ai).map((f) => f.id) ?? []); }}>{datasets.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.rows} rows)</option>)}</Select></Field>
              </div>
              <Field group label="Fields to monitor">
                <div className="flex flex-wrap gap-1.5">
                  {current?.fields.map((f) => {
                    const on = fields.includes(f.id);
                    return <button key={f.id} type="button" aria-pressed={on} onClick={() => setFields(on ? fields.filter((x) => x !== f.id) : [...fields, f.id])} className={`rounded-md border px-2.5 py-1 text-sm ${on ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}>{f.name}</button>;
                  })}
                </div>
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Frequency"><Select value={frequency} onChange={(e) => setFrequency(e.target.value)}><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="CUSTOM">Every N days</option></Select></Field>
                {frequency === "CUSTOM" ? <Field label="Every (days)" hint="1–90"><Input type="number" min={1} max={90} value={interval} onChange={(e) => setInterval(Number(e.target.value))} /></Field> : null}
                <Field label="Credit cap per run" hint={`Full refresh ≈ up to ${perRun} credits`}><Input type="number" min={5} max={2000} value={cap} onChange={(e) => setCap(Number(e.target.value))} /></Field>
              </div>
              <Button disabled={pending || !fields.length} onClick={() => start(async () => { const r = await createMonitoringRule(workspaceId, { name, datasetId: ds, fieldIds: fields, frequency, intervalDays: frequency === "CUSTOM" ? interval : 7, creditCapPerRun: cap }); if (!r.ok) toast.error(r.error); else { toast.success("Monitoring activated"); router.refresh(); } })}><Plus /> Activate monitoring</Button>
            </>
          )}
        </CardContent>
      </Card>
      {rules.length === 0 ? <EmptyState title="No monitoring yet">Activate a rule to be notified when deadlines, openings or researched values change.</EmptyState> : (
        <Card className="divide-y">
          {rules.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.name} <Badge variant={r.enabled ? "success" : "outline"} className="ml-1">{r.enabled ? "Active" : "Paused"}</Badge></p>
                <p className="text-xs text-muted-foreground">{r.dataset} · {r.fields.join(", ")} · {r.frequency === "CUSTOM" ? `every ${r.intervalDays} days` : r.frequency.toLowerCase()} · cap {r.cap} credits</p>
                <p className="text-xs text-muted-foreground">Last run {r.lastRunAt ? formatDate(r.lastRunAt) : "never"} · next {formatDate(r.nextRunAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => start(async () => { await updateMonitoringRule(workspaceId, r.id, { runNow: true }); toast.success("Scheduled to run within 15 minutes"); router.refresh(); })}><Play /> Run soon</Button>
                <Button size="sm" variant="outline" onClick={() => start(async () => { await updateMonitoringRule(workspaceId, r.id, { enabled: !r.enabled }); router.refresh(); })}>{r.enabled ? "Pause" : "Resume"}</Button>
                <Button size="icon" variant="ghost" aria-label="Delete rule" onClick={() => start(async () => { if (!confirm("Delete this rule?")) return; await deleteMonitoringRule(workspaceId, r.id); router.refresh(); })}><Trash2 /></Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
