"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, Lock, Plus, Trash2 } from "lucide-react";
import { addCompensation, deleteCompensation } from "@/app/actions/intel";
import { Button } from "./ui/button";
import { Badge, ConfidenceBadge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "./ui/card";
import { Dialog, DialogContent } from "./ui/dialog";
import { Field, Input, Select, Textarea } from "./ui/input";

type R = { id: string; company: string; roleTitle: string; seniority: string; city: string | null; country: string | null; year: number; currency: string; base: number | null; targetBonus: number | null; actualBonus: number | null; signing: number | null; lti: string | null; carry: string | null; sourceType: string; confidence: string; sourceUrl: string | null; notes: string | null; isPrivate: boolean };

const SOURCE: Record<string, string> = { OFFICIAL: "Officially disclosed", EMPLOYEE_REPORTED: "Employee-reported", MARKET_ESTIMATE: "Market estimate", USER_NETWORKING: "From your networking (private)", UNKNOWN: "Unknown" };

export function CompensationView({ workspaceId, records }: { workspaceId: string; records: R[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const cohorts = useMemo(() => {
    const m = new Map<string, { currency: string; year: number; seniority: string; n: number }>();
    for (const r of records) {
      const k = `${r.currency}|${r.year}|${r.seniority.toLowerCase()}`;
      m.set(k, { currency: r.currency, year: r.year, seniority: r.seniority, n: (m.get(k)?.n ?? 0) + 1 });
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [records]);
  const [picked, setCohort] = useState("");
  // Fall back to the largest group when nothing (or a group that no longer exists) is selected
  const cohort = cohorts.some(([k]) => k === picked) ? picked : cohorts[0]?.[0] ?? "";
  const c = cohorts.find(([k]) => k === cohort)?.[1];
  const chart = useMemo(() => {
    if (!c) return [];
    return records
      .filter((r) => r.currency === c.currency && r.year === c.year && r.seniority.toLowerCase() === c.seniority.toLowerCase() && r.base != null)
      .map((r) => ({ name: r.company, base: r.base ?? 0, bonus: r.actualBonus ?? r.targetBonus ?? 0, bonusKind: r.actualBonus != null ? "actual" : "target", source: SOURCE[r.sourceType], confidence: r.confidence }))
      .sort((a, b) => b.base + b.bonus - (a.base + a.bonus));
  }, [records, c]);
  const fmt = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: c?.currency ?? "EUR", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {cohorts.length ? (
          <Select className="w-auto" value={cohort} onChange={(e) => setCohort(e.target.value)} aria-label="Comparison group">
            {cohorts.map(([k, v]) => <option key={k} value={k}>{v.seniority} · {v.year} · {v.currency} ({v.n})</option>)}
          </Select>
        ) : null}
        <Button className="ml-auto" size="sm" onClick={() => setOpen(true)}><Plus /> Add data point</Button>
      </div>
      {records.length === 0 ? (
        <EmptyState title="No compensation data yet" action={<Button onClick={() => setOpen(true)}><Plus /> Add a data point</Button>}>
          Add figures from official disclosures, salary platforms or your networking calls. Research fields of type Currency in your tables are also a good source.
        </EmptyState>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Base vs bonus · {c?.seniority}, {c?.year}, {c?.currency}</CardTitle>
              <CardDescription>Only records in the same currency, year and seniority are compared. Bonus shows the actual figure when known, otherwise the target.</CardDescription>
            </CardHeader>
            <CardContent>
              {chart.length ? (
                <div className="h-72 w-full">
                  <ResponsiveContainer>
                    <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="30%" maxBarSize={48}>
                      <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} interval={0} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => new Intl.NumberFormat(undefined, { notation: "compact" }).format(v)} width={48} />
                      <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }} formatter={(v, k) => [fmt(Number(v ?? 0)), k === "base" ? "Base salary" : "Bonus"]} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.source ?? ""}`} />
                      <Legend formatter={(v) => <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}>{v === "base" ? "Base salary" : "Bonus"}</span>} />
                      <Bar dataKey="base" stackId="a" fill="var(--series-1)" stroke="hsl(var(--card))" strokeWidth={2} />
                      <Bar dataKey="bonus" stackId="a" fill="var(--series-2)" stroke="hsl(var(--card))" strokeWidth={2} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="py-8 text-center text-sm text-muted-foreground">No base salary figures in this group.</p>}
            </CardContent>
          </Card>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>{["Employer", "Role", "Location", "Year", "Base", "Bonus (target / actual)", "Other", "Source", "Confidence", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const m = (n: number | null) => (n == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: r.currency, maximumFractionDigits: 0 }).format(n));
                  return (
                    <tr key={r.id} className="border-t align-top">
                      <td className="px-3 py-2 font-medium">{r.company}</td>
                      <td className="px-3 py-2">{r.roleTitle}<p className="text-xs text-muted-foreground">{r.seniority}</p></td>
                      <td className="px-3 py-2">{[r.city, r.country].filter(Boolean).join(", ") || "—"}</td>
                      <td className="px-3 py-2">{r.year}</td>
                      <td className="px-3 py-2 tabular-nums">{m(r.base)}</td>
                      <td className="px-3 py-2 tabular-nums">{m(r.targetBonus)} / {m(r.actualBonus)}</td>
                      <td className="px-3 py-2 text-xs">{[r.signing != null ? `Signing ${m(r.signing)}` : null, r.lti ? `LTI: ${r.lti}` : null, r.carry ? `Carry: ${r.carry}` : null].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.isPrivate ? <Badge variant="outline" className="mb-1"><Lock className="size-3" /> Private</Badge> : null}
                        <p>{SOURCE[r.sourceType]}</p>
                        {r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary hover:underline">source <ExternalLink className="size-3" /></a> : null}
                      </td>
                      <td className="px-3 py-2"><ConfidenceBadge value={r.confidence} /></td>
                      <td className="px-3 py-2"><button aria-label="Delete" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => start(async () => { await deleteCompensation(workspaceId, r.id); router.refresh(); })}><Trash2 className="size-3.5" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide title="Add compensation data" description="Label the source honestly. Estimates stay estimates; insights from your calls stay private.">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const n = (k: string) => (f.get(k) ? Number(f.get(k)) : null); start(async () => {
            const r = await addCompensation(workspaceId, { companyName: (f.get("company") as string) || undefined, roleTitle: f.get("role"), seniority: f.get("seniority"), city: f.get("city") || null, country: f.get("country") || null, year: Number(f.get("year")), currency: f.get("currency"), baseSalary: n("base"), targetBonus: n("target"), actualBonus: n("actual"), signingBonus: n("signing"), longTermIncentive: f.get("lti") || null, carriedInterest: f.get("carry") || null, sourceType: f.get("sourceType"), confidence: f.get("confidence"), sourceUrl: f.get("url") || null, notes: f.get("notes") || null, isPrivate: f.get("private") === "on" });
            if (!r.ok) return void toast.error(r.error);
            setOpen(false); router.refresh();
          }); }}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Employer"><Input name="company" /></Field>
              <Field label="Role"><Input name="role" required defaultValue="Analyst" /></Field>
              <Field label="Seniority"><Input name="seniority" required defaultValue="Analyst 1" /></Field>
              <Field label="City"><Input name="city" /></Field>
              <Field label="Country"><Input name="country" /></Field>
              <Field label="Year"><Input name="year" type="number" required defaultValue={new Date().getFullYear()} /></Field>
              <Field label="Currency"><Input name="currency" required defaultValue="EUR" maxLength={3} /></Field>
              <Field label="Base salary"><Input name="base" type="number" min={0} /></Field>
              <Field label="Target bonus"><Input name="target" type="number" min={0} /></Field>
              <Field label="Actual reported bonus"><Input name="actual" type="number" min={0} /></Field>
              <Field label="Signing bonus"><Input name="signing" type="number" min={0} /></Field>
              <Field label="Long-term incentives"><Input name="lti" /></Field>
              <Field label="Carried interest"><Input name="carry" /></Field>
              <Field label="Source type"><Select name="sourceType" defaultValue="EMPLOYEE_REPORTED">{Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="Confidence"><Select name="confidence" defaultValue="REPORTED"><option value="VERIFIED">Verified</option><option value="REPORTED">Reported</option><option value="ESTIMATED">Estimated</option><option value="CONFLICTING">Conflicting</option><option value="UNKNOWN">Unknown</option></Select></Field>
            </div>
            <Field label="Source URL"><Input name="url" type="url" /></Field>
            <Field label="Notes"><Textarea name="notes" rows={2} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="private" /> Private (never treated as public information)</label>
            <div className="flex justify-end"><Button type="submit" disabled={pending}>Add</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
