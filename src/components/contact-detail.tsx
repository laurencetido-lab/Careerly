"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, ExternalLink, RefreshCw, Save, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { completeFollowUp, deleteContact, draftMessages, logInteraction, saveDraft, updateContact } from "@/app/actions/networking";
import { CONTACT_STAGES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Field, Input, Select, Textarea } from "./ui/input";

const PURPOSES = [
  ["CONNECTION_REQUEST", "LinkedIn connection request"], ["AFTER_CONNECTION", "Message after connection"], ["CALL_REQUEST", "Ask for a 15-minute call"],
  ["INTRO_EMAIL", "Introductory email"], ["FOLLOW_UP", "Follow-up"], ["THANK_YOU", "Thank you"], ["REFERRAL_REQUEST", "Referral request"],
  ["EVENT_FOLLOW_UP", "Event follow-up"], ["POST_APPLICATION", "After applying"],
] as const;

type Contact = { id: string; fullName: string; title: string | null; team: string | null; location: string | null; company: string | null; profileUrl: string | null; sourceUrl: string | null; sourceExcerpt: string | null; verifiedAt: string | null; reason: string | null; score: number; stage: string; alumniOf: string | null; isRecruiter: boolean; privateNotes: string | null; origin: string };
type Interaction = { id: string; type: string; occurredAt: string; summary: string | null; salaryInsight: string | null; recruitmentInsight: string | null; careerInsight: string | null; nextAction: string | null; followUpAt: string | null; followUpDone: boolean };

export function ContactDetail({ workspaceId, contact: c, interactions, drafts, aiConfigured, aiConsent, profileConfirmed, defaultLanguage }: {
  workspaceId: string; contact: Contact; interactions: Interaction[]; drafts: { id: string; purpose: string; tone: string; body: string; generatedBy: string; createdAt: string }[]; aiConfigured: boolean; aiConsent: boolean; profileConfirmed: boolean; defaultLanguage: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [purpose, setPurpose] = useState<string>(c.stage === "CALL_COMPLETED" ? "THANK_YOU" : "CONNECTION_REQUEST");
  const [platform, setPlatform] = useState<"LINKEDIN" | "EMAIL">("LINKEDIN");
  const [language, setLanguage] = useState(defaultLanguage);
  const [context, setContext] = useState("");
  const [result, setResult] = useState<{ generatedBy: string; usesProfile: boolean; professional: string; warm: string } | null>(null);
  const [tone, setTone] = useState<"professional" | "warm">("professional");
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState(c.privateNotes ?? "");
  const [alumni, setAlumni] = useState(c.alumniOf ?? "");

  function generate() {
    start(async () => {
      const r = await draftMessages(workspaceId, c.id, { purpose, platform, language, context: context || undefined });
      if (!r.ok) return void toast.error(r.error);
      setResult(r.data);
      setTone("professional");
      setBody(r.data.professional);
    });
  }

  const limit = purpose === "CONNECTION_REQUEST" ? 300 : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href={`/app/w/${workspaceId}/networking`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Networking</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">{c.fullName}</h1>
          <p className="text-sm text-muted-foreground">{[c.title ?? "Title not verified", c.team, c.company, c.location].filter(Boolean).join(" · ")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="primary">Relevance {c.score}/100</Badge>
            {c.isRecruiter ? <Badge>Recruitment</Badge> : null}
            {c.alumniOf ? <Badge variant="success">Alumni: {c.alumniOf}</Badge> : null}
            <Badge variant="outline">{c.origin === "RESEARCH" ? "Found in public sources" : "Added by you"}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select className="w-auto" value={c.stage} onChange={(e) => start(async () => { await updateContact(workspaceId, c.id, { stage: e.target.value }); router.refresh(); })} aria-label="Pipeline stage">
            {CONTACT_STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          {c.profileUrl ? <Button variant="outline" asChild><a href={c.profileUrl} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink /> Profile</a></Button> : null}
          <Button variant="ghost" size="icon" aria-label="Delete contact" onClick={() => start(async () => { if (!confirm(`Delete ${c.fullName} and their history?`)) return; await deleteContact(workspaceId, c.id); router.push(`/app/w/${workspaceId}/networking`); })}><Trash2 /></Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Write a message</CardTitle>
              <CardDescription>
                {aiConfigured ? "Drafted from your confirmed profile and this person's verified role. Nothing is sent automatically." : "AI is not configured, so drafts use templates filled only with verified facts."}
                {!profileConfirmed ? <> <Link href="/app/profile" className="text-primary hover:underline">Confirm your profile</Link> for more personal drafts.</> : aiConfigured && !aiConsent ? <> Your CV details are not shared with the AI until you <Link href="/app/settings" className="text-primary hover:underline">allow AI processing</Link>.</> : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Purpose"><Select value={purpose} onChange={(e) => setPurpose(e.target.value)}>{PURPOSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
                <Field label="Platform"><Select value={platform} onChange={(e) => setPlatform(e.target.value as "LINKEDIN" | "EMAIL")}><option value="LINKEDIN">LinkedIn</option><option value="EMAIL">Email</option></Select></Field>
                <Field label="Language"><Select value={language} onChange={(e) => setLanguage(e.target.value)}><option value="en">English</option><option value="fr">French</option><option value="de">German</option><option value="es">Spanish</option><option value="it">Italian</option></Select></Field>
              </div>
              <Field label="Anything specific to mention? (optional)" hint="Only add facts that are true, e.g. the event where you met."><Input value={context} onChange={(e) => setContext(e.target.value)} placeholder="We met at the HEC real estate conference on 12 March" /></Field>
              <Button onClick={generate} disabled={pending}>{result ? <><RefreshCw /> Regenerate</> : <><Sparkles /> Draft message</>}</Button>
              {result ? (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-md border p-0.5 text-sm">
                      {(["professional", "warm"] as const).map((tn) => <button key={tn} onClick={() => { setTone(tn); setBody(result[tn]); }} className={`rounded px-2.5 py-1 ${tone === tn ? "bg-muted font-medium" : "text-muted-foreground"}`}>{tn === "professional" ? "Professional & concise" : "Warm & conversational"}</button>)}
                    </div>
                    <Badge variant="outline">{result.generatedBy === "AI" ? "AI draft" : "Template"}</Badge>
                    {!result.usesProfile ? <Badge variant="warning">Profile not used</Badge> : null}
                  </div>
                  <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`text-xs ${limit && body.length > limit ? "text-destructive" : "text-muted-foreground"}`}>{body.length}{limit ? ` / ${limit}` : ""} characters</span>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(body); toast.success("Copied. Paste it into " + (platform === "LINKEDIN" ? "LinkedIn" : "your email")); } catch { toast.error("Could not copy. Select the text and copy it manually."); } }}><Copy /> Copy</Button>
                      <Button onClick={() => start(async () => { const r = await saveDraft(workspaceId, c.id, { purpose, platform, tone, language, body, generatedBy: body === result[tone] ? result.generatedBy : "USER" }); if (!r.ok) return void toast.error(r.error); toast.success("Saved to CRM"); router.refresh(); })}><Save /> Save to CRM</Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <LogInteraction workspaceId={workspaceId} contactId={c.id} onSaved={() => router.refresh()} />

          <Card>
            <CardHeader><CardTitle>History</CardTitle></CardHeader>
            <CardContent>
              {interactions.length === 0 && drafts.length === 0 ? <p className="text-sm text-muted-foreground">No interactions yet.</p> : null}
              <ol className="space-y-3">
                {interactions.map((i) => (
                  <li key={i.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{i.type.charAt(0) + i.type.slice(1).toLowerCase()} · {formatDate(i.occurredAt)}</span>
                      {i.followUpAt && !i.followUpDone ? (
                        <Button size="sm" variant="outline" onClick={() => start(async () => { await completeFollowUp(workspaceId, i.id); router.refresh(); })}><Check /> Follow-up {formatDate(i.followUpAt)} done</Button>
                      ) : i.followUpAt ? <Badge variant="success">Followed up</Badge> : null}
                    </div>
                    {i.summary ? <p className="mt-1 whitespace-pre-line">{i.summary}</p> : null}
                    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {i.recruitmentInsight ? <p><b>Recruitment:</b> {i.recruitmentInsight}</p> : null}
                      {i.salaryInsight ? <p><b>Salary (private):</b> {i.salaryInsight}</p> : null}
                      {i.careerInsight ? <p><b>Career:</b> {i.careerInsight}</p> : null}
                      {i.nextAction ? <p><b>Next:</b> {i.nextAction}</p> : null}
                    </div>
                  </li>
                ))}
                {drafts.map((d) => (
                  <li key={d.id} className="rounded-md border border-dashed p-3 text-sm">
                    <p className="text-xs text-muted-foreground">Saved draft · {PURPOSES.find(([k]) => k === d.purpose)?.[1] ?? d.purpose} · {d.tone} · {d.generatedBy.toLowerCase()} · {formatDate(d.createdAt)}</p>
                    <p className="mt-1 whitespace-pre-line">{d.body}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Why this person</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{c.reason ?? "Added manually."}</p>
              {c.sourceUrl ? (
                <div className="rounded-md bg-muted/50 p-2 text-xs">
                  <p className="flex items-center gap-1 font-medium"><ShieldCheck className="size-3.5 text-success" /> Public source{c.verifiedAt ? `, checked ${formatDate(c.verifiedAt)}` : ""}</p>
                  {c.sourceExcerpt ? <blockquote className="mt-1 border-l-2 pl-2 italic">“{c.sourceExcerpt}”</blockquote> : null}
                  <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 block truncate text-primary hover:underline">{c.sourceUrl}</a>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Shared background</CardTitle><CardDescription>Only add a school you know you share. Careerly never infers it.</CardDescription></CardHeader>
            <CardContent className="flex gap-2">
              <Input value={alumni} onChange={(e) => setAlumni(e.target.value)} placeholder="e.g. ESSEC Business School" />
              <Button variant="outline" onClick={() => start(async () => { const r = await updateContact(workspaceId, c.id, { alumniOf: alumni || null }); if (!r.ok) toast.error(r.error); else toast.success("Saved"); router.refresh(); })}>Save</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Private notes</CardTitle><CardDescription>Visible only in this workspace. Never used in searches.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <Button size="sm" variant="outline" onClick={() => start(async () => { const r = await updateContact(workspaceId, c.id, { privateNotes: notes }); if (!r.ok) toast.error(r.error); else toast.success("Notes saved"); })}>Save notes</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LogInteraction({ workspaceId, contactId, onSaved }: { workspaceId: string; contactId: string; onSaved: () => void }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div><CardTitle>Record a conversation</CardTitle><CardDescription>Capture insights right after a call while they are fresh.</CardDescription></div>
        {!open ? <Button size="sm" onClick={() => setOpen(true)}>Record</Button> : null}
      </CardHeader>
      {open ? (
        <CardContent>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); start(async () => {
            const r = await logInteraction(workspaceId, contactId, { type: f.get("type"), occurredAt: f.get("date") || undefined, summary: f.get("summary") || null, recruitmentInsight: f.get("recruitment") || null, salaryInsight: f.get("salary") || null, careerInsight: f.get("career") || null, nextAction: f.get("next") || null, followUpAt: f.get("follow") || null });
            if (!r.ok) return void toast.error(r.error);
            toast.success("Conversation saved");
            (e.target as HTMLFormElement).reset();
            setOpen(false);
            onSaved();
          }); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type"><Select name="type" defaultValue="CALL"><option value="CALL">Call</option><option value="MEETING">Meeting / coffee</option><option value="MESSAGE">LinkedIn message sent</option><option value="EMAIL">Email sent</option><option value="REFERRAL">Referral</option><option value="NOTE">Note</option></Select></Field>
              <Field label="Date"><Input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
            </div>
            <Field label="What did you learn?"><Textarea name="summary" rows={3} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Recruitment insight"><Textarea name="recruitment" rows={2} placeholder="Process, timing, who decides" /></Field>
              <Field label="Salary insight" hint="Private: never shared or used as public data"><Textarea name="salary" rows={2} /></Field>
              <Field label="Career insight"><Textarea name="career" rows={2} placeholder="Progression, exits" /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Next action"><Input name="next" placeholder="Send CV, ask for referral…" /></Field>
              <Field label="Follow-up reminder"><Input name="follow" type="date" /></Field>
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>Save conversation</Button></div>
          </form>
        </CardContent>
      ) : null}
    </Card>
  );
}
