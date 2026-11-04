"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Briefcase, ExternalLink, History, Lock, LockOpen, Pencil, Plus, Sparkles, Users, FolderKanban } from "lucide-react";
import { addManualEvidence, dismissSuggestion, getRowDetail, setConfirmed, updateCompany } from "@/app/actions/data";
import { planDiscovery, type PlanView } from "@/app/actions/research";
import { createApplication } from "@/app/actions/applications";
import type { GridField, GridRow } from "@/lib/grid-types";
import { FIELD_TYPE_LABELS, storageType } from "@/lib/fields";
import { formatDate } from "@/lib/utils";
import { Dialog, SheetContent } from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge, ConfidenceBadge } from "../ui/badge";
import { Input, Select, Textarea, Field } from "../ui/input";
import { CellEditor } from "./data-grid";
import { PlanReviewDialog } from "../plan-review";

type Detail = Extract<Awaited<ReturnType<typeof getRowDetail>>, { ok: true }>["data"];
const TIER: Record<number, string> = { 1: "Official site", 2: "Official careers page", 3: "Reputable publication", 4: "Salary platform", 5: "Other public source" };

export function RowDetail({ workspaceId, rowId, row, fields, canEdit, onClose, onResearch, onSave }: {
  workspaceId: string; rowId: string | null; row: GridRow | null; fields: GridField[]; canEdit: boolean; locations: string[]; onClose: () => void; onResearch: (fieldIds: string[]) => void; onSave: (f: GridField, v: string) => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [manual, setManual] = useState<GridField | null>(null);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!rowId) return setDetail(null);
    let alive = true;
    getRowDetail(workspaceId, rowId).then((r) => alive && (r.ok ? setDetail(r.data) : toast.error(r.error)));
    return () => { alive = false; };
  }, [workspaceId, rowId, row]);

  const primary = fields.find((f) => f.isPrimary);
  const title = (primary && row?.cells[primary.id]?.display) || "Row details";
  const companyId = detail?.company?.id ?? row?.companyId ?? null;

  const discover = (scope: "DISCOVER_CONTACTS" | "DISCOVER_OPPORTUNITIES") =>
    start(async () => {
      if (!companyId) return void toast.error("This row is not linked to an employer.");
      const r = await planDiscovery(workspaceId, { scope, objective: "", companyId, maxResults: 15 });
      if (!r.ok) return void toast.error(r.error);
      setPlan(r.data);
    });

  return (
    <>
      <Dialog open={!!rowId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent title={title} description={detail?.company?.website ?? undefined}>
          {detail?.company ? (
            <div className="mb-5 grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" onClick={() => discover("DISCOVER_CONTACTS")} disabled={pending || !canEdit}><Users /> Find people</Button>
              <Button variant="outline" size="sm" onClick={() => discover("DISCOVER_OPPORTUNITIES")} disabled={pending || !canEdit}><Briefcase /> Find jobs</Button>
              <Button variant="outline" size="sm" disabled={pending || !canEdit} onClick={() => start(async () => { const r = await createApplication(workspaceId, { companyId: detail.company!.id, role: "" }); if (!r.ok) toast.error(r.error); else { toast.success("Application created"); router.push(`/app/w/${workspaceId}/applications`); } })}><FolderKanban /> Track application</Button>
              <div className="col-span-3 grid gap-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">Online check</span>
                  <Badge variant={detail.company.verifyStatus === "VERIFIED" ? "success" : detail.company.verifyStatus === "NOT_FOUND" ? "danger" : detail.company.verifyStatus === "AMBIGUOUS" ? "warning" : "outline"}>
                    {({ VERIFIED: "Verified online", AMBIGUOUS: "To confirm", NOT_FOUND: "Not found online", UNVERIFIED: "Not verified yet" } as Record<string, string>)[detail.company.verifyStatus]}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {detail.company.verifyNote ?? "Use Research → Verify employers exist online to check this employer (1 credit)."}
                  {detail.company.verifySource ? <> · <a className="text-primary hover:underline" href={detail.company.verifySource} target="_blank" rel="noopener noreferrer nofollow">source</a></> : null}
                  {detail.company.verifiedAt ? ` · checked ${formatDate(detail.company.verifiedAt)}` : ""}
                </p>
                <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                  <Select aria-label="Priority" value={detail.company.priority} disabled={!canEdit} onChange={async (e) => { const r = await updateCompany(workspaceId, detail.company!.id, { priority: e.target.value }); if (!r.ok) toast.error(r.error); router.refresh(); }}>
                    <option value="NONE">No priority</option><option value="HIGH">★ High priority</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option><option value="EXCLUDED">Excluded</option>
                  </Select>
                  <Textarea aria-label="Private notes" rows={2} placeholder="Private notes (never used in research)" defaultValue={detail.company.privateNotes ?? ""} disabled={!canEdit} onBlur={async (e) => { if (e.target.value === (detail.company!.privateNotes ?? "")) return; const r = await updateCompany(workspaceId, detail.company!.id, { privateNotes: e.target.value || null }); if (!r.ok) toast.error(r.error); else toast.success("Notes saved"); }} />
                </div>
              </div>
              <p className="col-span-3 text-xs text-muted-foreground">
                {detail.company.contacts} contact{detail.company.contacts === 1 ? "" : "s"} · {detail.company.opportunities} opportunit{detail.company.opportunities === 1 ? "y" : "ies"} ·{" "}
                <Link className="text-primary hover:underline" href={`/app/w/${workspaceId}/networking?company=${detail.company.id}`}>see contacts</Link>
              </p>
            </div>
          ) : null}
          <div className="space-y-4">
            {fields.filter((f) => !f.isPrimary).map((f) => {
              const c = row?.cells[f.id];
              const v = detail?.values.find((x) => x.fieldId === f.id);
              return (
                <section key={f.id} className="rounded-lg border p-3" aria-label={f.name}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{f.type === "AI_RESEARCH" ? <Sparkles className="size-3 text-primary" /> : null}{f.name} <span className="font-normal">· {FIELD_TYPE_LABELS[storageType(f)]}</span></p>
                      {editing === f.id ? (
                        <div className="mt-1"><CellEditor field={f} initial={c?.raw ?? ""} onCancel={() => setEditing(null)} onSave={(val) => { setEditing(null); onSave(f, val); }} /></div>
                      ) : (
                        <p className="mt-1 whitespace-pre-line break-words text-sm">{c?.display || <span className="italic text-muted-foreground">{v?.confidence === "UNKNOWN" ? "Unknown: no supporting public evidence found" : "Empty"}</span>}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <ConfidenceBadge value={v?.confidence ?? c?.confidence} />
                      {v?.confirmed ? <Badge variant="outline"><Lock className="size-3" /> Confirmed</Badge> : null}
                    </div>
                  </div>
                  {v?.suggestion ? (
                    <div className="mt-2 rounded-md bg-warning/10 p-2 text-xs">
                      Research found <b>{v.suggestion}</b>. Your confirmed value was kept.
                      {canEdit ? <span className="ml-2 inline-flex gap-2"><button className="text-primary hover:underline" onClick={() => setEditing(f.id)}>Edit value</button><button className="text-muted-foreground hover:underline" onClick={async () => { await dismissSuggestion(workspaceId, rowId!, f.id); router.refresh(); }}>Dismiss</button></span> : null}
                    </div>
                  ) : null}
                  {v?.notes ? <p className="mt-2 text-xs text-muted-foreground">{v.notes}</p> : null}
                  {v?.evidence.length ? (
                    <ul className="mt-3 space-y-2">
                      {v.evidence.map((e) => (
                        <li key={e.id} className="rounded-md bg-muted/50 p-2 text-xs">
                          <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 font-medium text-primary hover:underline">
                            <span className="truncate">{e.title || e.domain}</span><ExternalLink className="size-3 shrink-0" />
                          </a>
                          <p className="mt-0.5 text-muted-foreground">{e.domain} · {TIER[e.tier]} · {e.origin === "MANUAL" ? "added by you" : "found by research"}</p>
                          <blockquote className="mt-1.5 border-l-2 pl-2 italic">“{e.excerpt}”</blockquote>
                          <p className="mt-1.5 text-muted-foreground">
                            <ConfidenceBadge value={e.confidence} className="mr-1" /> {e.publishedAt ? `Published ${formatDate(e.publishedAt)} · ` : ""}Retrieved {formatDate(e.retrievedAt)} · Verified {formatDate(e.verifiedAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {v?.history.length ? (
                    <details className="mt-2 text-xs">
                      <summary className="flex cursor-pointer items-center gap-1 text-muted-foreground"><History className="size-3" /> History ({v.history.length})</summary>
                      <ul className="mt-1 space-y-1">
                        {v.history.map((h) => <li key={h.id} className="text-muted-foreground">{formatDate(h.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}: <s>{h.previous || "empty"}</s> → <b className="text-foreground">{h.next || "empty"}</b> · {h.reason}</li>)}
                      </ul>
                    </details>
                  ) : null}
                  {canEdit && f.type !== "FORMULA" ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(f.id)}><Pencil /> Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => onResearch([f.id])}><Sparkles /> Research</Button>
                      <Button size="sm" variant="ghost" onClick={() => setManual(f)}><Plus /> Add value with source</Button>
                      <Button size="sm" variant="ghost" onClick={async () => { const r = await setConfirmed(workspaceId, rowId!, f.id, !v?.confirmed); if (!r.ok) toast.error(r.error); router.refresh(); }}>
                        {v?.confirmed ? <><LockOpen /> Unconfirm</> : <><Lock /> Confirm value</>}
                      </Button>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
          {canEdit ? <div className="mt-5"><Button className="w-full" variant="secondary" onClick={() => onResearch(fields.filter((f) => !f.isPrimary && f.type !== "FORMULA").map((f) => f.id))}><Sparkles /> Research every field for this row</Button></div> : null}
        </SheetContent>
      </Dialog>
      <ManualEvidenceDialog workspaceId={workspaceId} rowId={rowId} field={manual} onClose={() => { setManual(null); router.refresh(); }} />
      <PlanReviewDialog workspaceId={workspaceId} plan={plan} onClose={() => { setPlan(null); router.refresh(); }} />
    </>
  );
}

function ManualEvidenceDialog({ workspaceId, rowId, field, onClose }: { workspaceId: string; rowId: string | null; field: GridField | null; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [url, setUrl] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [confidence, setConfidence] = useState("REPORTED");
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  if (!field || !rowId) return null;
  return (
    <Dialog open={!!field} onOpenChange={(o) => !o && onClose()}>
      <SheetContent title={`Add ${field.name} with its source`} description="Manual research: record what you found and where. It is stored with the same evidence trail as automated research.">
        <div className="space-y-4">
          <Field label="Value"><Input value={value} onChange={(e) => setValue(e.target.value)} /></Field>
          <Field label="Source URL"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://careers.example.com/graduates" /></Field>
          <Field label="Evidence" hint="Paste the passage from the source that supports this value."><Textarea rows={4} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} /></Field>
          <Field label="Confidence">
            <Select value={confidence} onChange={(e) => setConfidence(e.target.value)}>
              <option value="VERIFIED">Verified: official company or careers source</option>
              <option value="REPORTED">Reported: third-party source</option>
              <option value="ESTIMATED">Estimated</option>
              <option value="CONFLICTING">Conflicting sources</option>
            </Select>
          </Field>
          <Field label="Notes (optional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 2025 figure, base only" /></Field>
          <Button className="w-full" disabled={pending} onClick={() => start(async () => {
            const r = await addManualEvidence(workspaceId, rowId, field.id, { value, sourceUrl: url, excerpt, confidence, notes: notes || undefined });
            if (!r.ok) return void toast.error(r.error);
            toast.success("Saved with evidence");
            setValue(""); setUrl(""); setExcerpt(""); setNotes("");
            onClose();
          })}>Save value and evidence</Button>
        </div>
      </SheetContent>
    </Dialog>
  );
}
