"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Ban, Plus, Trash2 } from "lucide-react";
import { saveScoringModel } from "@/app/actions/intel";
import { scoreRows, sensitivity, type Criterion, type ScoreRowInput } from "@/lib/scoring";
import { FIELD_TYPE_LABELS, type FieldTypeName } from "@/lib/fields";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "./ui/card";
import { Input, Select } from "./ui/input";

type Crit = Omit<Criterion, "label">;

export function RankingView({ workspaceId, datasets, datasetId, model, fields, rows }: {
  workspaceId: string; datasets: { id: string; name: string }[]; datasetId: string | null; model: { id: string; name: string; criteria: Crit[] } | null;
  fields: { id: string; name: string; type: FieldTypeName }[]; rows: ScoreRowInput[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const numeric = fields.filter((f) => ["NUMBER", "CURRENCY", "PERCENT", "BOOLEAN"].includes(f.type));
  const [criteria, setCriteria] = useState<Crit[]>(model?.criteria ?? []);
  const [expanded, setExpanded] = useState<string | null>(null);
  const label = (id: string) => fields.find((f) => f.id === id)?.name ?? "?";
  const full: Criterion[] = criteria.map((c) => ({ ...c, label: label(c.fieldId) }));
  const total = criteria.reduce((a, c) => a + c.weight, 0);
  const results = useMemo(() => (criteria.length ? scoreRows(rows, full) : []), [rows, criteria]); // eslint-disable-line react-hooks/exhaustive-deps
  const shifts = useMemo(() => (criteria.length && rows.length <= 300 ? sensitivity(rows, full) : new Map<string, number>()), [rows, criteria]); // eslint-disable-line react-hooks/exhaustive-deps
  const ranked = results.filter((r) => r.rank != null);
  const excluded = results.filter((r) => r.excluded);
  const unscored = results.filter((r) => !r.excluded && r.score == null);

  if (!datasetId) return <EmptyState title="Nothing to rank yet">Import or discover employers first, then add numeric or yes/no fields to score them on.</EmptyState>;

  const update = (i: number, patch: Partial<Crit>) => setCriteria(criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Your criteria</CardTitle>
          <CardDescription>Weights must add up to 100%. Hard constraints exclude employers whatever their score.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={datasetId} onChange={(e) => router.push(`/app/w/${workspaceId}/ranking?dataset=${e.target.value}`)} aria-label="Table">
            {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          {criteria.map((c, i) => (
            <div key={i} className="space-y-2 rounded-md border p-2.5">
              <div className="flex gap-1.5">
                <Select className="h-8" value={c.fieldId} onChange={(e) => update(i, { fieldId: e.target.value })} aria-label="Field">
                  {fields.map((f) => <option key={f.id} value={f.id}>{f.name} ({FIELD_TYPE_LABELS[f.type]})</option>)}
                </Select>
                <Button size="icon" variant="ghost" onClick={() => setCriteria(criteria.filter((_, j) => j !== i))} aria-label="Remove criterion"><Trash2 /></Button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="text-xs text-muted-foreground">Weight %<Input className="mt-1 h-8" type="number" min={0} max={100} value={c.weight} onChange={(e) => update(i, { weight: Number(e.target.value) })} /></label>
                <label className="text-xs text-muted-foreground">Better when<Select className="mt-1 h-8" value={c.direction} onChange={(e) => update(i, { direction: e.target.value as Crit["direction"] })}><option value="HIGHER">Higher</option><option value="LOWER">Lower</option><option value="TRUE">Yes</option></Select></label>
                <label className="text-xs text-muted-foreground">Hard constraint<Select className="mt-1 h-8" value={c.constraintType} onChange={(e) => update(i, { constraintType: e.target.value as Crit["constraintType"] })}><option value="NONE">None</option><option value="MIN">At least</option><option value="MAX">At most</option><option value="EQUALS">Must equal</option></Select></label>
                {c.constraintType !== "NONE" ? <label className="text-xs text-muted-foreground">Value<Input className="mt-1 h-8" value={c.constraintValue ?? ""} onChange={(e) => update(i, { constraintValue: e.target.value })} /></label> : null}
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" disabled={!fields.length} onClick={() => setCriteria([...criteria, { fieldId: (numeric[0] ?? fields[0]).id, weight: Math.max(0, 100 - total), direction: "HIGHER", constraintType: "NONE", constraintValue: null }])}><Plus /> Add criterion</Button>
          {!numeric.length ? <p className="text-xs text-muted-foreground">Add Number, Currency, Percentage or Yes/No fields to your table to score on them. Text fields can be used as hard constraints.</p> : null}
          <div className="flex items-center justify-between border-t pt-3">
            <span className={`text-sm ${Math.abs(total - 100) > 0.5 ? "text-destructive" : "text-muted-foreground"}`}>Total {total}%</span>
            <Button size="sm" disabled={pending || !criteria.length} onClick={() => start(async () => { const r = await saveScoringModel(workspaceId, model?.id ?? null, { name: model?.name ?? "My ranking", datasetId, criteria }); if (!r.ok) toast.error(r.error); else { toast.success("Ranking saved"); router.refresh(); } })}>Save ranking</Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {!criteria.length ? <EmptyState title="Define what matters to you">For example: compensation 30%, responsibilities 25%, progression 20%, feasibility 15%, reputation 10%.</EmptyState> : (
          <Card>
            <CardHeader>
              <CardTitle>Ranking</CardTitle>
              <CardDescription>Score out of 100 on the criteria with data. Click a row for the breakdown. “Sensitive” means the rank moves if one weight changes by 10 points.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {ranked.map((r) => (
                <div key={r.id}>
                  <button className="grid w-full grid-cols-[28px_minmax(0,1fr)_minmax(0,1.3fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted" onClick={() => setExpanded(expanded === r.id ? null : r.id)} aria-expanded={expanded === r.id}>
                    <span className="text-sm tabular-nums text-muted-foreground">{r.rank}</span>
                    <span className="truncate text-sm font-medium">{r.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className="block h-full rounded-full" style={{ width: `${r.score}%`, background: "var(--series-1)", opacity: r.provisional ? 0.55 : 1 }} />
                      </span>
                      <span className="w-9 text-right text-sm tabular-nums">{Math.round(r.score!)}</span>
                    </span>
                    <span className="flex gap-1">
                      {r.provisional ? <Badge variant="warning" title={r.reasons.join("\n")}><AlertTriangle className="size-3" /> Provisional · {Math.round(r.completeness * 100)}%</Badge> : <Badge variant="success">Complete</Badge>}
                      {(shifts.get(r.id) ?? 0) >= 2 ? <Badge variant="outline">Sensitive</Badge> : null}
                    </span>
                  </button>
                  {expanded === r.id ? (
                    <div className="mb-2 ml-10 rounded-md border bg-muted/30 p-3 text-xs">
                      {r.breakdown.map((b) => <p key={b.fieldId}><b>{b.label}:</b> {b.contribution == null ? <span className="text-muted-foreground">no data (not counted)</span> : `${b.contribution.toFixed(1)} points (${Math.round((b.normalized ?? 0) * 100)}% of best in table)`}</p>)}
                      {r.reasons.map((x) => <p key={x} className="mt-1 text-muted-foreground">{x}</p>)}
                    </div>
                  ) : null}
                </div>
              ))}
              {ranked.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No employer has data for these criteria yet. Research the fields first.</p> : null}
            </CardContent>
          </Card>
        )}
        {excluded.length ? (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Ban className="size-4" /> Excluded by hard constraints</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">{excluded.map((r) => <p key={r.id}><b>{r.label}</b> <span className="text-muted-foreground">· {r.reasons.filter((x) => x.startsWith("Fails")).join("; ")}</span></p>)}</CardContent>
          </Card>
        ) : null}
        {unscored.length ? <p className="text-xs text-muted-foreground">{unscored.length} employer{unscored.length > 1 ? "s have" : " has"} no data for any criterion and {unscored.length > 1 ? "are" : "is"} not ranked: {unscored.slice(0, 8).map((r) => r.label).join(", ")}{unscored.length > 8 ? "…" : ""}</p> : null}
      </div>
    </div>
  );
}
