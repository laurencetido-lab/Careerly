"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock, ExternalLink, Plus, Trash2 } from "lucide-react";
import { addStage, createApplication, deleteApplication, saveInterview, updateApplication } from "@/app/actions/applications";
import { INTERVIEW_TOPICS } from "@/lib/interview-topics";
import { formatDate, cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, EmptyState } from "./ui/card";
import { Dialog, DialogContent, SheetContent } from "./ui/dialog";
import { Field, Input, Select, Textarea } from "./ui/input";

type Interview = { id: string; round: string; scheduledAt: string | null; format: string | null; questions: string | null; preparedAnswers: string | null; notes: string | null; feedback: string | null; prepProgress: number };
type App = { id: string; role: string; stage: string; company: string | null; companyId: string | null; recruiterId: string | null; recruiter: string | null; applicationUrl: string | null; appliedAt: string | null; deadline: string | null; cvVersion: string | null; coverLetter: string | null; tests: string | null; feedback: string | null; compensationNote: string | null; nextAction: string | null; nextActionAt: string | null; interviews: Interview[] };

const d10 = (s: string | null) => (s ? s.slice(0, 10) : "");

export function ApplicationsBoard({ workspaceId, stages, apps, companies, contacts, openId }: { workspaceId: string; stages: { key: string; label: string }[]; apps: App[]; companies: { id: string; name: string }[]; contacts: { id: string; fullName: string }[]; openId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drag, setDrag] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(openId);
  const [add, setAdd] = useState(false);
  const current = apps.find((a) => a.id === open) ?? null;

  const move = (id: string, stage: string) => start(async () => { const r = await updateApplication(workspaceId, id, { stage }); if (!r.ok) toast.error(r.error); router.refresh(); });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setAdd(true)}><Plus /> New application</Button>
        <Button size="sm" variant="outline" onClick={() => start(async () => { const l = prompt("Name of the new stage (added before Accepted/Rejected)"); if (!l) return; const r = await addStage(workspaceId, l); if (!r.ok) toast.error(r.error); router.refresh(); })}><Plus /> Stage</Button>
      </div>
      {apps.length === 0 ? (
        <EmptyState title="No applications yet" action={<Button onClick={() => setAdd(true)}><Plus /> Track an application</Button>}>Add one here, or click <b>Track application</b> on an employer or opportunity.</EmptyState>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {stages.map((s) => {
            const col = apps.filter((a) => a.stage === s.key);
            return (
              <div key={s.key} className="w-64 shrink-0 rounded-lg bg-muted/40 p-2" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) move(drag, s.key); setDrag(null); }}>
                <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">{s.label} · {col.length}</p>
                <div className="min-h-[40px] space-y-2">
                  {col.map((a) => {
                    const nextIv = a.interviews.find((i) => i.scheduledAt && new Date(i.scheduledAt) > new Date());
                    return (
                      <Card key={a.id} draggable onDragStart={() => setDrag(a.id)} onClick={() => setOpen(a.id)} className="cursor-pointer p-2.5 hover:border-primary/40">
                        <p className="text-sm font-medium">{a.role}</p>
                        <p className="text-xs text-muted-foreground">{a.company ?? "No employer"}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {a.deadline ? <Badge variant="warning">Due {formatDate(a.deadline, { day: "numeric", month: "short" })}</Badge> : null}
                          {nextIv ? <Badge variant="primary"><CalendarClock className="size-3" /> {formatDate(nextIv.scheduledAt, { day: "numeric", month: "short" })}</Badge> : null}
                          {a.nextAction ? <Badge variant="outline" className="max-w-full truncate">{a.nextAction}</Badge> : null}
                        </div>
                        <Select className="mt-1.5 h-6 px-1 text-[11px] sm:hidden" value={a.stage} onClick={(e) => e.stopPropagation()} onChange={(e) => move(a.id, e.target.value)} aria-label="Move to stage">
                          {stages.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                        </Select>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={add} onOpenChange={setAdd}>
        <DialogContent title="New application">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); start(async () => {
            const r = await createApplication(workspaceId, { role: String(f.get("role") ?? ""), companyId: f.get("company") || null, applicationUrl: f.get("url") || null, deadline: f.get("deadline") || null, stage: f.get("stage") });
            if (!r.ok) return void toast.error(r.error);
            setAdd(false); router.refresh();
          }); }}>
            <Field label="Role"><Input name="role" required placeholder="Investment Analyst" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Employer"><Select name="company"><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Stage"><Select name="stage" defaultValue="INTERESTED">{stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></Field>
              <Field label="Application URL"><Input name="url" type="url" /></Field>
              <Field label="Deadline"><Input name="deadline" type="date" /></Field>
            </div>
            <div className="flex justify-end"><Button type="submit" disabled={pending}>Create</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!current} onOpenChange={(o) => !o && setOpen(null)}>
        {current ? (
          <SheetContent title={current.role} description={current.company ?? undefined}>
            <AppEditor key={current.id} workspaceId={workspaceId} app={current} stages={stages} contacts={contacts} companies={companies} onDone={() => router.refresh()} onDelete={() => start(async () => { if (!confirm("Delete this application?")) return; await deleteApplication(workspaceId, current.id); setOpen(null); router.refresh(); })} />
          </SheetContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function AppEditor({ workspaceId, app, stages, contacts, companies, onDone, onDelete }: { workspaceId: string; app: App; stages: { key: string; label: string }[]; contacts: { id: string; fullName: string }[]; companies: { id: string; name: string }[]; onDone: () => void; onDelete: () => void }) {
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<"details" | "interviews">("details");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-md border p-0.5 text-sm">
        {(["details", "interviews"] as const).map((t) => <button key={t} className={cn("flex-1 rounded px-2 py-1", tab === t && "bg-muted font-medium")} onClick={() => setTab(t)}>{t === "details" ? "Details" : `Interview prep (${app.interviews.length})`}</button>)}
      </div>
      {tab === "details" ? (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const g = (k: string) => (f.get(k) as string) || null; start(async () => {
          const r = await updateApplication(workspaceId, app.id, { role: String(f.get("role")), stage: g("stage") ?? undefined, companyId: g("company"), recruiterId: g("recruiter"), applicationUrl: g("url"), appliedAt: g("applied"), deadline: g("deadline"), cvVersion: g("cv"), coverLetter: g("cover"), tests: g("tests"), feedback: g("feedback"), compensationNote: g("comp"), nextAction: g("next"), nextActionAt: g("nextAt") });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Saved"); onDone();
        }); }}>
          <Field label="Role"><Input name="role" defaultValue={app.role} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Stage"><Select name="stage" defaultValue={app.stage}>{stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></Field>
            <Field label="Employer"><Select name="company" defaultValue={app.companyId ?? ""}><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Recruiter"><Select name="recruiter" defaultValue={app.recruiterId ?? ""}><option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</Select></Field>
            <Field label="Application URL"><Input name="url" defaultValue={app.applicationUrl ?? ""} /></Field>
            <Field label="Applied on"><Input name="applied" type="date" defaultValue={d10(app.appliedAt)} /></Field>
            <Field label="Deadline"><Input name="deadline" type="date" defaultValue={d10(app.deadline)} /></Field>
            <Field label="CV version"><Input name="cv" defaultValue={app.cvVersion ?? ""} placeholder="CV_RE_v3.pdf" /></Field>
            <Field label="Compensation discussed"><Input name="comp" defaultValue={app.compensationNote ?? ""} /></Field>
            <Field label="Next action"><Input name="next" defaultValue={app.nextAction ?? ""} /></Field>
            <Field label="Next action date"><Input name="nextAt" type="date" defaultValue={d10(app.nextActionAt)} /></Field>
          </div>
          <Field label="Tests / assessments"><Textarea name="tests" rows={2} defaultValue={app.tests ?? ""} /></Field>
          <Field label="Cover letter"><Textarea name="cover" rows={4} defaultValue={app.coverLetter ?? ""} /></Field>
          <Field label="Feedback received"><Textarea name="feedback" rows={2} defaultValue={app.feedback ?? ""} /></Field>
          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={onDelete}><Trash2 /> Delete</Button>
            <div className="flex gap-2">
              {app.applicationUrl ? <Button type="button" variant="outline" asChild><a href={app.applicationUrl} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink /> Open</a></Button> : null}
              <Button type="submit" disabled={pending}>Save</Button>
            </div>
          </div>
        </form>
      ) : (
        <InterviewPrep workspaceId={workspaceId} app={app} onDone={onDone} />
      )}
    </div>
  );
}

function InterviewPrep({ workspaceId, app, onDone }: { workspaceId: string; app: App; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [industry, setIndustry] = useState("finance");
  const [editing, setEditing] = useState<Interview | "new" | null>(app.interviews.length ? null : "new");
  const topics = [...INTERVIEW_TOPICS[industry].topics, ...INTERVIEW_TOPICS.general.topics];
  const iv = editing === "new" ? null : editing;
  return (
    <div className="space-y-3">
      {app.interviews.map((i) => (
        <button key={i.id} onClick={() => setEditing(i)} className="flex w-full items-center justify-between rounded-md border p-2 text-left text-sm hover:bg-muted">
          <span><b>{i.round}</b>{i.scheduledAt ? ` · ${formatDate(i.scheduledAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}{i.format ? ` · ${i.format}` : ""}</span>
          <Badge variant={i.prepProgress >= 80 ? "success" : "outline"}>{i.prepProgress}% ready</Badge>
        </button>
      ))}
      {editing === null ? <Button size="sm" variant="outline" onClick={() => setEditing("new")}><Plus /> Add interview round</Button> : (
        <form key={iv?.id ?? "new"} className="space-y-3 rounded-md border p-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const checked = topics.filter((_, k) => f.get(`t${k}`) === "on").length; start(async () => {
          const r = await saveInterview(workspaceId, app.id, iv?.id ?? null, { round: String(f.get("round")), scheduledAt: (f.get("at") as string) || null, format: (f.get("format") as string) || null, questions: (f.get("questions") as string) || null, preparedAnswers: (f.get("answers") as string) || null, notes: (f.get("notes") as string) || null, feedback: (f.get("feedback") as string) || null, prepProgress: Math.round((checked / topics.length) * 100) });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Interview saved"); setEditing(null); onDone();
        }); }}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Round"><Input name="round" defaultValue={iv?.round ?? "First round"} required /></Field>
            <Field label="Date & time"><Input name="at" type="datetime-local" defaultValue={iv?.scheduledAt?.slice(0, 16) ?? ""} /></Field>
            <Field label="Format"><Input name="format" defaultValue={iv?.format ?? ""} placeholder="Video, technical, case…" /></Field>
          </div>
          <Field group label="Preparation checklist">
            <Select value={industry} onChange={(e) => setIndustry(e.target.value)} className="mb-2 h-8 w-auto">
              {Object.entries(INTERVIEW_TOPICS).filter(([k]) => k !== "general").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <div className="grid gap-1 sm:grid-cols-2">
              {topics.map((t, k) => <label key={t} className="flex items-start gap-2 text-xs"><input type="checkbox" name={`t${k}`} defaultChecked={(iv?.prepProgress ?? 0) >= Math.round(((k + 1) / topics.length) * 100)} className="mt-0.5" /> {t}</label>)}
            </div>
          </Field>
          <Field label="Expected questions"><Textarea name="questions" rows={3} defaultValue={iv?.questions ?? ""} /></Field>
          <Field label="Saved answers"><Textarea name="answers" rows={4} defaultValue={iv?.preparedAnswers ?? ""} /></Field>
          <Field label="Mock interview notes"><Textarea name="notes" rows={2} defaultValue={iv?.notes ?? ""} /></Field>
          <Field label="Feedback after the interview"><Textarea name="feedback" rows={2} defaultValue={iv?.feedback ?? ""} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={pending}>Save interview</Button></div>
        </form>
      )}
    </div>
  );
}
