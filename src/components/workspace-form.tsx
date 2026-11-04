"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createWorkspace, updateWorkspace } from "@/app/actions/workspace";
import { Button } from "./ui/button";
import { Field, Input, Textarea } from "./ui/input";

const LANGS = [["en", "English"], ["fr", "French"], ["de", "German"], ["es", "Spanish"], ["it", "Italian"], ["nl", "Dutch"], ["pt", "Portuguese"]] as const;

const EXAMPLES = [
  "I graduate in June 2027 and want a high-paying investment analyst role in Paris or London, ideally in private equity real estate.",
  "Find AI engineering internships in Europe that sponsor visas and allow hybrid work.",
  "Junior strategy consulting roles in London for someone with 2 years of experience in banking.",
];

export function WorkspaceForm({ initial, workspaceId, onboarding }: { initial?: { name: string; objective: string; targetLocations: string[]; targetRoles: string[]; searchLanguages: string[] }; workspaceId?: string; onboarding?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial?.name ?? "");
  const [objective, setObjective] = useState(initial?.objective ?? "");
  const [locations, setLocations] = useState(initial?.targetLocations.join(", ") ?? "");
  const [roles, setRoles] = useState(initial?.targetRoles.join(", ") ?? "");
  const [langs, setLangs] = useState<string[]>(initial?.searchLanguages ?? ["en"]);

  function submit(next: "import" | "discover" | "home") {
    start(async () => {
      const input = { name, objective, targetLocations: locations, targetRoles: roles, searchLanguages: langs };
      const res = workspaceId ? await updateWorkspace(workspaceId, input) : await createWorkspace(input);
      if (!res.ok) return void toast.error(res.error);
      const id = workspaceId ?? (res.data as { id: string }).id;
      toast.success(workspaceId ? "Workspace updated" : "Workspace created");
      router.push(next === "import" ? `/app/w/${id}/import` : next === "discover" ? `/app/w/${id}/research?new=discover` : `/app/w/${id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Field label="Workspace name" htmlFor="ws-name" hint="For example: Real Estate Investment CDI 2027">
        <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Investment Banking Graduate Programmes" />
      </Field>
      <Field label="Your career objective" htmlFor="ws-objective" hint="Write it the way you would explain it to a mentor. Careerly uses it to plan research.">
        <Textarea id="ws-objective" rows={4} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder={EXAMPLES[0]} />
      </Field>
      {!objective ? (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setObjective(ex)} className="rounded-full border px-2.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted">
              {ex.length > 70 ? ex.slice(0, 70) + "…" : ex}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Target locations" htmlFor="ws-loc" hint="Comma-separated">
          <Input id="ws-loc" value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Paris, London" />
        </Field>
        <Field label="Target roles" htmlFor="ws-roles" hint="Comma-separated">
          <Input id="ws-roles" value={roles} onChange={(e) => setRoles(e.target.value)} placeholder="Investment Analyst, Graduate Programme" />
        </Field>
      </div>
      <Field group label="Research languages">
        <div className="flex flex-wrap gap-1.5">
          {LANGS.map(([code, label]) => {
            const on = langs.includes(code);
            return (
              <button key={code} type="button" aria-pressed={on} onClick={() => setLangs(on ? (langs.length > 1 ? langs.filter((l) => l !== code) : langs) : [...langs, code].slice(0, 4))} className={`rounded-md border px-2.5 py-1 text-sm ${on ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                {label}
              </button>
            );
          })}
        </div>
      </Field>
      {onboarding ? (
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <button disabled={pending || !name} onClick={() => submit("import")} className="rounded-lg border p-4 text-left transition hover:border-primary hover:bg-accent/40 disabled:opacity-50">
            <p className="font-medium">I have a spreadsheet</p>
            <p className="mt-1 text-sm text-muted-foreground">Upload an Excel or CSV list of employers and let Careerly enrich it.</p>
          </button>
          <button disabled={pending || !name || objective.length < 8} onClick={() => submit("discover")} className="rounded-lg border p-4 text-left transition hover:border-primary hover:bg-accent/40 disabled:opacity-50">
            <p className="font-medium">Start from scratch</p>
            <p className="mt-1 text-sm text-muted-foreground">Careerly proposes a research plan to discover relevant employers.</p>
          </button>
        </div>
      ) : (
        <Button onClick={() => submit("home")} disabled={pending || !name}>{pending ? "Saving…" : workspaceId ? "Save changes" : "Create workspace"}</Button>
      )}
    </div>
  );
}
