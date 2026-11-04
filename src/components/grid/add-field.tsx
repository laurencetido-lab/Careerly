"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { addField } from "@/app/actions/data";
import { CREATABLE_TYPES, FIELD_TYPE_LABELS, RESEARCH_VALUE_TYPES, type FieldTypeName } from "@/lib/fields";
import type { GridField } from "@/lib/grid-types";
import { Button } from "../ui/button";
import { Dialog, DialogContent } from "../ui/dialog";
import { Field, Input, Select, Textarea } from "../ui/input";

const PRESETS = [
  { name: "Analyst salary", valueType: "CURRENCY", prompt: "Find the most recent available entry-level analyst base salary for the target office. Distinguish base salary from bonus and give the year." },
  { name: "Graduate programme", valueType: "LONG_TEXT", prompt: "Identify whether the employer has a graduate programme open to candidates graduating next year. Give official links and verified deadlines only." },
  { name: "Internship conversion", valueType: "LONG_TEXT", prompt: "Research whether final-year internships can convert into permanent positions. Do not invent conversion rates." },
  { name: "Open positions", valueType: "LONG_TEXT", prompt: "List currently open junior positions relevant to my target roles in my target locations, from the official careers site." },
  { name: "Visa sponsorship", valueType: "BOOLEAN", prompt: "Does the employer state that it sponsors work visas for the target country? Only answer from official or reputable sources." },
] as const;

export function AddFieldDialog({ open, onOpenChange, workspaceId, datasetId, fields }: { open: boolean; onOpenChange: (o: boolean) => void; workspaceId: string; datasetId: string; fields: GridField[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldTypeName>("AI_RESEARCH");
  const [valueType, setValueType] = useState<FieldTypeName>("TEXT");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState("");
  const [formula, setFormula] = useState("");
  const [currency, setCurrency] = useState("EUR");

  function reset() {
    setName(""); setType("AI_RESEARCH"); setValueType("TEXT"); setPrompt(""); setOptions(""); setFormula("");
  }

  function submit() {
    start(async () => {
      const res = await addField(workspaceId, datasetId, {
        name, type,
        valueType: type === "AI_RESEARCH" ? valueType : null,
        options: options.split(",").map((o) => o.trim()).filter(Boolean),
        currency: (type === "CURRENCY" || valueType === "CURRENCY") ? currency : null,
        formula: type === "FORMULA" ? formula : null,
        researchPrompt: prompt || null,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Field “${name}” added`);
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a field" description="Add your own column. AI-researched fields are filled from real web sources, with evidence.">
        <div className="space-y-4">
          {type === "AI_RESEARCH" ? (
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.name} type="button" onClick={() => { setName(p.name); setValueType(p.valueType as FieldTypeName); setPrompt(p.prompt); }} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted">
                  <Sparkles className="mr-1 inline size-3" />{p.name}
                </button>
              ))}
            </div>
          ) : null}
          <Field label="Field name" htmlFor="field-name"><Input id="field-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Analyst salary" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="field-type">
              <Select id="field-type" value={type} onChange={(e) => setType(e.target.value as FieldTypeName)}>
                {CREATABLE_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
              </Select>
            </Field>
            {type === "AI_RESEARCH" ? (
              <Field label="Researched value is a" htmlFor="field-vt">
                <Select id="field-vt" value={valueType} onChange={(e) => setValueType(e.target.value as FieldTypeName)}>
                  {RESEARCH_VALUE_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
                </Select>
              </Field>
            ) : null}
          </div>
          {(type === "CURRENCY" || (type === "AI_RESEARCH" && valueType === "CURRENCY")) ? <Field label="Default currency"><Input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></Field> : null}
          {(type === "SINGLE_SELECT" || type === "MULTI_SELECT") ? <Field label="Options" hint="Comma-separated"><Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="High, Medium, Low" /></Field> : null}
          {type === "FORMULA" ? (
            <Field label="Formula" hint={<>Use {"{Field name}"}. Available: {fields.filter((f) => ["NUMBER", "CURRENCY", "PERCENT", "BOOLEAN"].includes(f.type === "AI_RESEARCH" ? f.valueType ?? "" : f.type)).map((f) => f.name).join(", ") || "no numeric fields yet"}</>}>
              <Input className="font-mono" value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="{Base salary} + {Bonus}" />
            </Field>
          ) : null}
          {type !== "FORMULA" ? (
            <Field label={type === "AI_RESEARCH" ? "What should Careerly research?" : "Research instruction (optional)"} htmlFor="field-prompt" hint="Write it like a brief to an analyst. You can review the plan before anything runs.">
              <Textarea id="field-prompt" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Find the most recent entry-level analyst base salary for the Paris office. Distinguish base from bonus and provide sources." />
            </Field>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !name.trim() || (type === "AI_RESEARCH" && !prompt.trim())}>Add field</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
