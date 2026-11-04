"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Plus, Trash2, Upload } from "lucide-react";
import { saveProfile, uploadCv } from "@/app/actions/profile";
import type { ProfileProposal } from "@/server/cv";
import { formatDate } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Field, Input, Textarea } from "./ui/input";
import { Badge } from "./ui/badge";

const csv = (a: string[]) => a.join(", ");
const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export function ProfileEditor({ initial, aiConsent, aiConfigured, cv, confirmedAt }: { initial: ProfileProposal; aiConsent: boolean; aiConfigured: boolean; cv: { id: string; name: string } | null; confirmedAt: string | null }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [pending, start] = useTransition();
  const [method, setMethod] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ProfileProposal>(k: K, v: ProfileProposal[K]) => setP({ ...p, [k]: v });

  function onCv(f: File | undefined) {
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    start(async () => {
      const r = await uploadCv(fd);
      if (!r.ok) return void toast.error(r.error);
      setP({ ...r.data.proposal, preferredLocations: r.data.proposal.preferredLocations.length ? r.data.proposal.preferredLocations : p.preferredLocations });
      setMethod(r.data.method);
      toast.success("CV read. Review the proposed profile, correct it, then confirm.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>CV</CardTitle>
          <CardDescription>
            Optional. PDF or DOCX. {aiConsent && aiConfigured ? "Extraction uses Claude (you allowed AI processing)." : <>Extraction runs locally on our server{aiConfigured ? <>. <Link href="/app/settings" className="text-primary hover:underline">Allow AI processing</Link> for more accurate extraction</> : ""}.</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".pdf,.docx" className="sr-only" onChange={(e) => onCv(e.target.files?.[0])} data-testid="cv-file" aria-label="CV file" />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={pending}><Upload /> {pending ? "Reading…" : cv ? "Replace CV" : "Upload CV"}</Button>
          {cv ? <a className="text-sm text-primary hover:underline" href={`/api/files/${cv.id}`}>{cv.name}</a> : null}
          {method ? <Badge variant="warning">Proposed by {method === "AI" ? "AI" : "local parser"}. Please review</Badge> : confirmedAt ? <Badge variant="success"><CheckCircle2 className="size-3" /> Confirmed {formatDate(confirmedAt)}</Badge> : <Badge variant="outline">Not confirmed yet</Badge>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2"><Field label="Headline"><Input value={p.headline ?? ""} onChange={(e) => set("headline", e.target.value || null)} placeholder="MSc Finance student at ESSEC" /></Field></div>
            <Field label="Graduation (YYYY-MM)"><Input value={p.graduationDate ?? ""} onChange={(e) => set("graduationDate", e.target.value || null)} placeholder="2027-06" /></Field>
          </div>
          <Field label="Availability"><Input value={p.availability ?? ""} onChange={(e) => set("availability", e.target.value || null)} placeholder="Full-time from September 2027" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Skills" hint="Comma-separated"><Textarea rows={2} defaultValue={csv(p.skills)} onBlur={(e) => set("skills", list(e.target.value))} /></Field>
            <Field label="Languages"><Textarea rows={2} defaultValue={csv(p.languages)} onBlur={(e) => set("languages", list(e.target.value))} /></Field>
            <Field label="Preferred locations"><Textarea rows={2} defaultValue={csv(p.preferredLocations)} onBlur={(e) => set("preferredLocations", list(e.target.value))} /></Field>
            <Field label="Career interests"><Textarea rows={2} defaultValue={csv(p.careerInterests)} onBlur={(e) => set("careerInterests", list(e.target.value))} /></Field>
          </div>
          <Field label="Achievements" hint="One per line, only real ones."><Textarea rows={3} defaultValue={p.achievements.join("\n")} onBlur={(e) => set("achievements", e.target.value.split("\n").map((x) => x.trim()).filter(Boolean))} /></Field>

          <section>
            <div className="mb-2 flex items-center justify-between"><p className="text-sm font-medium">Education</p><Button size="sm" variant="ghost" onClick={() => set("education", [...p.education, { institution: "", degree: null, field: null, startDate: null, endDate: null }])}><Plus /> Add</Button></div>
            <div className="space-y-2">
              {p.education.map((e, i) => (
                <div key={i} className="grid gap-1.5 rounded-md border p-2 sm:grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_auto]">
                  <Input className="h-8" placeholder="Institution" value={e.institution} onChange={(x) => set("education", p.education.map((y, j) => (j === i ? { ...y, institution: x.target.value } : y)))} />
                  <Input className="h-8" placeholder="Degree" value={e.degree ?? ""} onChange={(x) => set("education", p.education.map((y, j) => (j === i ? { ...y, degree: x.target.value || null } : y)))} />
                  <Input className="h-8" placeholder="Field" value={e.field ?? ""} onChange={(x) => set("education", p.education.map((y, j) => (j === i ? { ...y, field: x.target.value || null } : y)))} />
                  <Input className="h-8" placeholder="Start" value={e.startDate ?? ""} onChange={(x) => set("education", p.education.map((y, j) => (j === i ? { ...y, startDate: x.target.value || null } : y)))} />
                  <Input className="h-8" placeholder="End" value={e.endDate ?? ""} onChange={(x) => set("education", p.education.map((y, j) => (j === i ? { ...y, endDate: x.target.value || null } : y)))} />
                  <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => set("education", p.education.filter((_, j) => j !== i))}><Trash2 /></Button>
                </div>
              ))}
            </div>
          </section>
          <section>
            <div className="mb-2 flex items-center justify-between"><p className="text-sm font-medium">Experience</p><Button size="sm" variant="ghost" onClick={() => set("experience", [...p.experience, { employer: "", title: null, location: null, startDate: null, endDate: null, summary: null }])}><Plus /> Add</Button></div>
            <div className="space-y-2">
              {p.experience.map((e, i) => (
                <div key={i} className="space-y-1.5 rounded-md border p-2">
                  <div className="grid gap-1.5 sm:grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr_auto]">
                    <Input className="h-8" placeholder="Employer" value={e.employer} onChange={(x) => set("experience", p.experience.map((y, j) => (j === i ? { ...y, employer: x.target.value } : y)))} />
                    <Input className="h-8" placeholder="Title" value={e.title ?? ""} onChange={(x) => set("experience", p.experience.map((y, j) => (j === i ? { ...y, title: x.target.value || null } : y)))} />
                    <Input className="h-8" placeholder="Location" value={e.location ?? ""} onChange={(x) => set("experience", p.experience.map((y, j) => (j === i ? { ...y, location: x.target.value || null } : y)))} />
                    <Input className="h-8" placeholder="Start" value={e.startDate ?? ""} onChange={(x) => set("experience", p.experience.map((y, j) => (j === i ? { ...y, startDate: x.target.value || null } : y)))} />
                    <Input className="h-8" placeholder="End" value={e.endDate ?? ""} onChange={(x) => set("experience", p.experience.map((y, j) => (j === i ? { ...y, endDate: x.target.value || null } : y)))} />
                    <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => set("experience", p.experience.filter((_, j) => j !== i))}><Trash2 /></Button>
                  </div>
                  <Textarea rows={2} placeholder="What you did (from your CV)" value={e.summary ?? ""} onChange={(x) => set("experience", p.experience.map((y, j) => (j === i ? { ...y, summary: x.target.value || null } : y)))} />
                </div>
              ))}
            </div>
          </section>
          <div className="flex justify-end border-t pt-4">
            <Button disabled={pending} onClick={() => start(async () => {
              const clean = { ...p, education: p.education.filter((e) => e.institution.trim()), experience: p.experience.filter((e) => e.employer.trim()) };
              const r = await saveProfile(clean);
              if (!r.ok) return void toast.error(r.error);
              setMethod(null);
              toast.success("Profile confirmed");
              router.refresh();
            })}><CheckCircle2 /> Confirm profile</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
