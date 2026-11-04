"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { commitImport, previewImport, uploadSpreadsheet, validateImportAction } from "@/app/actions/import";
import { planVerification, type PlanView } from "@/app/actions/research";
import { PlanReviewDialog } from "./plan-review";
import { FIELD_TYPE_LABELS, type FieldTypeName } from "@/lib/fields";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Field, Input, Select } from "./ui/input";
import { cn } from "@/lib/utils";

type Preview = { sheetName: string; headerRow: number; rowCount: number; recognisedHeaders: string[]; columns: { index: number; header: string; inferredType: FieldTypeName; samples: string[]; emptyCount: number; suggestedBinding: "company.name" | "company.website" | null }[]; sampleRows: string[][] };
type Mapping = { index: number; name: string; type: FieldTypeName; include: boolean; binding: "company.name" | "company.website" | null };
type Validation = { issues: { row: number; column: string; message: string }[]; issueCount: number; duplicates: { row: number; firstRow: number; value: string }[]; invalidNames: { row: number; value: string; reason: string }[]; invalidNameCount: number; totalRows: number; truncated: boolean; recognisedHeaders: string[]; blocked: string | null; needsConfirmation: string | null };

const IMPORT_TYPES: FieldTypeName[] = ["TEXT", "LONG_TEXT", "NUMBER", "CURRENCY", "PERCENT", "DATE", "BOOLEAN", "SINGLE_SELECT", "MULTI_SELECT", "URL", "EMAIL"];

export function ImportWizard({ workspaceId, datasets }: { workspaceId: string; datasets: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<{ fileId: string; fileName: string; sheets: { name: string; rows: number }[] } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Mapping[]>([]);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [target, setTarget] = useState<string>("");
  const [duplicates, setDuplicates] = useState<"skip" | "keep">("skip");
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ datasetId: string; created: number; updated: number; skipped: number; invalidCells: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const [confirmList, setConfirmList] = useState(false);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function applyPreview(p: Preview) {
    setPreview(p);
    setMapping(p.columns.map((c) => ({ index: c.index, name: c.header.slice(0, 80), type: c.inferredType, include: true, binding: c.suggestedBinding })));
    setValidation(null);
  }

  function onFile(f: File | undefined) {
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    start(async () => {
      const res = await uploadSpreadsheet(workspaceId, fd);
      if (!res.ok) return void toast.error(res.error);
      setFile(res.data);
      setDatasetName(f.name.replace(/\.(xlsx|xls|csv)$/i, ""));
      applyPreview(res.data.preview);
      setStep(2);
    });
  }

  function changeSheet(name: string, headerRow?: number) {
    if (!file) return;
    start(async () => {
      const res = await previewImport(workspaceId, file.fileId, name, headerRow);
      if (!res.ok) return void toast.error(res.error);
      applyPreview(res.data);
    });
  }

  function validate() {
    if (!file || !preview) return;
    start(async () => {
      const res = await validateImportAction(workspaceId, file.fileId, preview.sheetName, preview.headerRow, mapping);
      if (!res.ok) return void toast.error(res.error);
      setValidation(res.data);
      setConfirmList(false);
      setStep(3);
    });
  }

  function commit() {
    if (!file || !preview) return;
    start(async () => {
      const res = await commitImport(workspaceId, { fileId: file.fileId, sheetName: preview.sheetName, headerRow: preview.headerRow, datasetName, targetDatasetId: target || null, duplicates, corrections, confirmEmployerList: confirmList }, mapping);
      if (!res.ok) return void toast.error(res.error);
      setResult(res.data);
      setStep(4);
      router.refresh();
    });
  }

  const update = (i: number, patch: Partial<Mapping>) =>
    setMapping((m) =>
      m.map((x, j) => {
        if (j === i) return { ...x, ...patch };
        // Only one column can hold each binding
        if (patch.binding && x.binding === patch.binding) return { ...x, binding: null };
        return x;
      }),
    );

  const issuesByCell = useMemo(() => {
    const map = new Map<string, { row: number; column: string; message: string; index: number }>();
    for (const is of validation?.issues ?? []) {
      const m = mapping.find((x) => x.name === is.column);
      if (m) map.set(`${is.row}:${m.index}`, { ...is, index: m.index });
    }
    return [...map.entries()];
  }, [validation, mapping]);

  const steps = ["Upload", "Map columns", "Review", "Done"];

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Import steps">
        {steps.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2 rounded-full border px-3 py-1", step === i + 1 ? "border-primary bg-accent text-accent-foreground" : step > i + 1 ? "text-foreground" : "text-muted-foreground")}>
            <span className="text-xs">{i + 1}</span> {s}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card>
          <CardContent className="pt-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
              className={cn("flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-14 text-center transition", drag && "border-primary bg-accent/40")}
            >
              <FileSpreadsheet className="size-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Drop an Excel or CSV file</p>
              <p className="mt-1 text-sm text-muted-foreground">XLSX, XLS or CSV up to 10 MB. Any columns work: Careerly detects them.</p>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" aria-label="Spreadsheet file" data-testid="import-file" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button className="mt-5" onClick={() => inputRef.current?.click()} disabled={pending}>
                <Upload /> {pending ? "Reading file…" : "Choose file"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && preview && file && (
        <div className="space-y-4">
          <Card>
            <CardContent className="grid gap-4 pt-4 sm:grid-cols-3">
              <Field label="Sheet">
                <Select value={preview.sheetName} onChange={(e) => changeSheet(e.target.value)}>
                  {file.sheets.map((s) => (
                    <option key={s.name} value={s.name}>{s.name} ({s.rows} rows)</option>
                  ))}
                </Select>
              </Field>
              <Field label="Header row" hint={`${preview.rowCount} data rows detected`}>
                <Select value={preview.headerRow} onChange={(e) => changeSheet(preview.sheetName, Number(e.target.value))}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <option key={i} value={i}>Row {i + 1}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Import into">
                <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">A new table</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>Update “{d.name}”</option>
                  ))}
                </Select>
              </Field>
              {!target && (
                <Field label="Table name">
                  <Input value={datasetName} onChange={(e) => setDatasetName(e.target.value)} />
                </Field>
              )}
            </CardContent>
          </Card>
          {(() => {
            const nameCol = mapping.find((m) => m.include && m.binding === "company.name");
            if (!preview.rowCount) return <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"><b>This file has no data rows.</b> Check the header row or choose another sheet.</div>;
            if (!nameCol) return <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"><b>No column looks like a list of employer names.</b> Careerly expects a list of companies (for example a “Company” or “Employer” column). If this file has one, set its role to “Employer name”; otherwise this file is not suitable.</div>;
            if (!preview.recognisedHeaders.length) return <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"><b>This file does not look like a list of employers.</b> No usual column (Company, Role, City, Salary, Website…) was recognised. You will need to confirm that “{nameCol.name}” really contains company names.</div>;
            return <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm"><b className="text-success">Looks like a list of employers.</b> Recognised columns: {preview.recognisedHeaders.join(", ")}.</div>;
          })()}
          <Card className="overflow-hidden">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-medium">Columns</p>
              <p className="text-xs text-muted-foreground">Check the detected type of each column. Mark the column that names the employer. All other columns are kept as custom fields.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2">Keep</th>
                    <th className="px-3 py-2">Column name</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Sample values</th>
                  </tr>
                </thead>
                <tbody>
                  {mapping.map((m, i) => {
                    const col = preview.columns.find((c) => c.index === m.index)!;
                    return (
                      <tr key={m.index} className={cn("border-t", !m.include && "opacity-50")}>
                        <td className="px-3 py-2"><input type="checkbox" checked={m.include} onChange={(e) => update(i, { include: e.target.checked })} aria-label={`Keep ${m.name}`} /></td>
                        <td className="px-3 py-2"><Input value={m.name} onChange={(e) => update(i, { name: e.target.value })} className="h-8" aria-label="Column name" /></td>
                        <td className="px-3 py-2">
                          <Select value={m.type} onChange={(e) => update(i, { type: e.target.value as FieldTypeName })} className="h-8" aria-label={`Type of ${m.name}`}>
                            {IMPORT_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Select value={m.binding ?? ""} onChange={(e) => update(i, { binding: (e.target.value || null) as Mapping["binding"] })} className="h-8" aria-label={`Role of ${m.name}`}>
                            <option value="">Custom field</option>
                            <option value="company.name">Employer name</option>
                            <option value="company.website">Employer website</option>
                          </Select>
                        </td>
                        <td className="max-w-[260px] truncate px-3 py-2 text-xs text-muted-foreground" title={col.samples.join(" · ")}>
                          {col.samples.join(" · ") || "—"} {col.emptyCount ? <span className="ml-1">({col.emptyCount} empty)</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={validate} disabled={pending}>{pending ? "Checking…" : "Check data"}</Button>
          </div>
        </div>
      )}

      {step === 3 && validation && validation.blocked && (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 text-destructive" /><div><p className="font-medium">This file cannot be imported</p><p className="text-sm text-muted-foreground">{validation.blocked}</p></div></div>
              {validation.invalidNames.length ? (
                <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-3 text-xs">
                  {validation.invalidNames.slice(0, 15).map((n) => <li key={n.row}><span className="text-muted-foreground">Row {n.row}:</span> “{n.value}” · <span className="text-destructive">{n.reason}</span></li>)}
                </ul>
              ) : null}
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => { setStep(1); setFile(null); setPreview(null); }}>Choose another file</Button>
            <Button onClick={() => setStep(2)}>Change the employer column</Button>
          </div>
        </div>
      )}

      {step === 3 && validation && !validation.blocked && (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="primary">{validation.totalRows} rows</Badge>
                <Badge variant={validation.issueCount ? "warning" : "success"}>{validation.issueCount} value issue{validation.issueCount === 1 ? "" : "s"}</Badge>
                <Badge variant={validation.duplicates.length ? "warning" : "success"}>{validation.duplicates.length} duplicate{validation.duplicates.length === 1 ? "" : "s"}</Badge>
                {validation.truncated ? <Badge variant="danger">Only the first 5,000 rows will be imported</Badge> : null}
                {validation.invalidNameCount ? <Badge variant="danger">{validation.invalidNameCount} row{validation.invalidNameCount === 1 ? "" : "s"} excluded</Badge> : null}
              </div>
              {validation.invalidNameCount ? (
                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium">Rows excluded: not company names</p>
                  <ul className="mt-1 max-h-32 overflow-y-auto text-xs text-muted-foreground">
                    {validation.invalidNames.slice(0, 30).map((n) => <li key={n.row}>Row {n.row}: “{n.value}” · {n.reason}</li>)}
                  </ul>
                </div>
              ) : null}
              {validation.needsConfirmation ? (
                <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                  <p><b>Confirmation needed.</b> {validation.needsConfirmation}</p>
                  <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={confirmList} onChange={(e) => setConfirmList(e.target.checked)} /> I confirm this file is a list of employers I am targeting.</label>
                </div>
              ) : null}
              {validation.duplicates.length > 0 && (
                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium">Duplicate employers</p>
                  <ul className="mt-1 max-h-32 overflow-y-auto text-xs text-muted-foreground">
                    {validation.duplicates.slice(0, 50).map((d) => <li key={d.row}>Row {d.row}: “{d.value}” repeats row {d.firstRow}</li>)}
                  </ul>
                  <div className="mt-2 flex gap-4 text-sm">
                    <label className="flex items-center gap-1.5"><input type="radio" checked={duplicates === "skip"} onChange={() => setDuplicates("skip")} /> Keep the first, skip repeats</label>
                    <label className="flex items-center gap-1.5"><input type="radio" checked={duplicates === "keep"} onChange={() => setDuplicates("keep")} /> Import every row</label>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          {issuesByCell.length > 0 && (
            <Card className="overflow-hidden">
              <div className="flex items-start gap-2 border-b px-4 py-3">
                <AlertTriangle className="mt-0.5 size-4 text-warning" />
                <div>
                  <p className="text-sm font-medium">Fix values before importing</p>
                  <p className="text-xs text-muted-foreground">Correct a value here, or go back and change the column type. Values left invalid are imported as empty.</p>
                </div>
              </div>
              <div className="max-h-[380px] overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {issuesByCell.map(([key, is]) => (
                      <tr key={key} className="border-t">
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">Row {is.row}</td>
                        <td className="px-2 py-2 text-xs">{is.column}</td>
                        <td className="px-2 py-2 text-xs text-destructive">{is.message}</td>
                        <td className="px-4 py-2"><Input className="h-8" placeholder="Corrected value" value={corrections[key] ?? ""} onChange={(e) => setCorrections({ ...corrections, [key]: e.target.value })} aria-label={`Correct row ${is.row} ${is.column}`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={commit} disabled={pending || (!!validation.needsConfirmation && !confirmList)}>{pending ? "Importing…" : `Import ${validation.totalRows - validation.invalidNameCount} rows`}</Button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center">
            <CheckCircle2 className="size-8 text-success" />
            <p className="mt-3 text-lg font-medium">Import complete</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.created} new rows · {result.updated} updated · {result.skipped} skipped{result.invalidCells ? ` · ${result.invalidCells} invalid values left empty` : ""}
            </p>
            <div className="mt-5 w-full max-w-md rounded-lg border bg-muted/40 p-3 text-left text-sm">
              <p className="font-medium">Check these employers exist</p>
              <p className="text-muted-foreground">Careerly searches the web for each name and marks it verified, to confirm or not found. It also fills in missing websites. 1 credit per employer, and you approve the budget first.</p>
              <Button className="mt-2" size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await planVerification(workspaceId, { datasetId: result.datasetId, rowIds: [] }); if (!r.ok) return void toast.error(r.error); setPlan(r.data); })}>Verify employers online</Button>
            </div>
            <div className="mt-5 flex gap-2">
              <Button asChild><Link href={`/app/w/${workspaceId}/data/${result.datasetId}`}>Open table</Link></Button>
              <Button variant="outline" onClick={() => { setStep(1); setFile(null); setPreview(null); setCorrections({}); }}>Import another file</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <PlanReviewDialog workspaceId={workspaceId} plan={plan} onClose={() => setPlan(null)} />
    </div>
  );
}
