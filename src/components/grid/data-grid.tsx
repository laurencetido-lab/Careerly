"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Columns3, Download, EyeOff, Filter, Group, Lock, MoreHorizontal, PanelRightOpen, Pencil, Plus, Search, ShieldCheck, Sparkles, Trash2, Upload, Save,
} from "lucide-react";
import { addRow, deleteField, deleteRows, deleteView, moveField, saveView, updateCell, updateField } from "@/app/actions/data";
import { planDiscovery, planEnrichment, planVerification, type PlanView } from "@/app/actions/research";
import { evaluateFormula } from "@/lib/formula";
import { FIELD_TYPE_LABELS, storageType } from "@/lib/fields";
import type { GridField, GridRow, ViewConfig } from "@/lib/grid-types";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Input, Select, Textarea, Field as FormField } from "../ui/input";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "../ui/dropdown";
import { Dialog, DialogContent } from "../ui/dialog";
import { Badge } from "../ui/badge";
import { PlanReviewDialog } from "../plan-review";
import { AddFieldDialog } from "./add-field";
import { RowDetail } from "./row-detail";

const CONF_DOT: Record<string, string> = { VERIFIED: "bg-success", REPORTED: "bg-primary", ESTIMATED: "bg-warning", CONFLICTING: "bg-destructive", UNKNOWN: "bg-muted-foreground/40" };
const PAGE = 100;
const EMPTY_VIEW: ViewConfig = { sort: null, filters: [], hidden: [], groupBy: null, search: "" };

export function DataGrid({ workspaceId, dataset, fields, rows, views, canEdit, openRowId, locations }: {
  workspaceId: string; dataset: { id: string; name: string }; fields: GridField[]; rows: GridRow[]; views: { id: string; name: string; config: ViewConfig }[]; canEdit: boolean; openRowId: string | null; locations: string[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [view, setView] = useState<ViewConfig>(EMPTY_VIEW);
  const [activeView, setActiveView] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ rowId: string; fieldId: string } | null>(null);
  const [detail, setDetail] = useState<string | null>(openRowId);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [widths, setWidths] = useState<Record<string, number>>(() => Object.fromEntries(fields.map((f) => [f.id, f.width])));
  const [fieldDialog, setFieldDialog] = useState<GridField | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newRow, setNewRow] = useState("");
  const [triage, setTriage] = useState<"ALL" | "HIGH" | "ACTIVE" | "NOT_FOUND" | "UNVERIFIED">("ALL");

  useEffect(() => setWidths((w) => ({ ...Object.fromEntries(fields.map((f) => [f.id, f.width])), ...w })), [fields]);

  const hiddenIds = useMemo(() => new Set([...fields.filter((f) => f.hidden).map((f) => f.id), ...view.hidden]), [fields, view.hidden]);
  const visible = fields.filter((f) => !hiddenIds.has(f.id));
  const primary = fields.find((f) => f.isPrimary) ?? fields[0];

  // Formula values computed client-side from numeric cells
  const computed = useMemo(() => {
    const formulas = fields.filter((f) => f.type === "FORMULA" && f.formula);
    if (!formulas.length) return rows;
    const byName = new Map(fields.map((f) => [f.name.toLowerCase(), f.id]));
    return rows.map((r) => {
      const cells = { ...r.cells };
      for (const f of formulas) {
        let v: number | null = null;
        try {
          v = evaluateFormula(f.formula!, (ref) => cells[byName.get(ref.toLowerCase()) ?? ""]?.num ?? null);
        } catch {
          v = null;
        }
        cells[f.id] = { display: v == null ? "" : new Intl.NumberFormat().format(Math.round(v * 100) / 100), raw: v == null ? "" : String(v), num: v, confidence: null, origin: "FORMULA", confirmed: false, evidence: 0, suggestion: null };
      }
      return { ...r, cells };
    });
  }, [rows, fields]);

  const filtered = useMemo(() => {
    const q = view.search.trim().toLowerCase();
    let out = computed.filter((r) => {
      if (triage === "HIGH" && r.priority !== "HIGH") return false;
      if (triage === "ACTIVE" && r.priority === "EXCLUDED") return false;
      if (triage === "NOT_FOUND" && !["NOT_FOUND", "AMBIGUOUS"].includes(r.verify?.status ?? "")) return false;
      if (triage === "UNVERIFIED" && r.verify?.status !== "UNVERIFIED") return false;
      if (q && !Object.values(r.cells).some((c) => c.display.toLowerCase().includes(q))) return false;
      return view.filters.every((f) => {
        const c = r.cells[f.fieldId];
        const d = (c?.display ?? "").toLowerCase();
        const v = f.value.toLowerCase();
        switch (f.op) {
          case "contains": return d.includes(v);
          case "equals": return d === v || c?.raw.toLowerCase() === v;
          case "gt": return c?.num != null && c.num > Number(f.value);
          case "lt": return c?.num != null && c.num < Number(f.value);
          case "empty": return !d;
          case "notEmpty": return !!d;
        }
      });
    });
    if (view.sort) {
      const { fieldId, dir } = view.sort;
      const m = dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const x = a.cells[fieldId], y = b.cells[fieldId];
        if (!x?.display && !y?.display) return 0;
        if (!x?.display) return 1;
        if (!y?.display) return -1;
        if (x.num != null && y.num != null) return (x.num - y.num) * m;
        return x.raw.localeCompare(y.raw, undefined, { numeric: true }) * m;
      });
    }
    return out;
  }, [computed, view, triage]);

  const groups = useMemo(() => {
    if (!view.groupBy) return [{ key: "", rows: filtered }];
    const map = new Map<string, GridRow[]>();
    for (const r of filtered) {
      const k = r.cells[view.groupBy]?.display || "(empty)";
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()].map(([key, rows]) => ({ key, rows }));
  }, [filtered, view.groupBy]);

  const research = useCallback((args: { fieldIds: string[]; rowIds: string[]; scope: "CELL" | "ROW" | "ROWS" | "COLUMN" | "DATASET" }) => {
    start(async () => {
      const res = await planEnrichment(workspaceId, { datasetId: dataset.id, ...args });
      if (!res.ok) return void toast.error(res.error);
      setPlan(res.data);
    });
  }, [workspaceId, dataset.id]);

  const researchable = fields.filter((f) => !f.isPrimary && f.type !== "FORMULA");

  async function saveCell(rowId: string, field: GridField, raw: string) {
    setEditing(null);
    const res = await updateCell(workspaceId, rowId, field.id, raw);
    if (!res.ok) return void toast.error(res.error);
    const prev = res.data.previous;
    router.refresh();
    toast.success(`${field.name} updated`, {
      action: { label: "Undo", onClick: async () => { const u = await updateCell(workspaceId, rowId, field.id, prev); if (!u.ok) toast.error(u.error); router.refresh(); } },
    });
  }

  function startResize(e: React.PointerEvent, f: GridField) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[f.id] ?? f.width;
    const move = (ev: PointerEvent) => setWidths((w) => ({ ...w, [f.id]: Math.max(80, Math.min(640, startW + ev.clientX - startX)) }));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const width = Math.max(80, Math.min(640, startW + ev.clientX - startX));
      if (canEdit) updateField(workspaceId, f.id, { width });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const shown = groups.reduce((acc, g) => acc + g.rows.length, 0);
  let rendered = 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/app/w/${workspaceId}/data`} className="hover:underline">Tables</Link>
            <span>/</span>
          </div>
          <h1 className="page-title truncate">{dataset.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild><Link href={`/app/w/${workspaceId}/import`}><Upload /> Import</Link></Button>
          <Button variant="outline" size="sm" asChild><a href={`/api/export/${dataset.id}?workspace=${workspaceId}`}><Download /> Export Excel</a></Button>
          {canEdit ? (
            <Menu>
              <MenuTrigger asChild><Button size="sm"><Sparkles /> Research <ChevronDown /></Button></MenuTrigger>
              <MenuContent align="end" className="w-64">
                <MenuLabel>Enrich this table</MenuLabel>
                <MenuItem onSelect={() => research({ fieldIds: researchable.filter((f) => f.type === "AI_RESEARCH").map((f) => f.id).length ? researchable.filter((f) => f.type === "AI_RESEARCH").map((f) => f.id) : researchable.map((f) => f.id), rowIds: [], scope: "DATASET" })}>
                  <Sparkles /> All AI-researched fields, all rows
                </MenuItem>
                <MenuItem disabled={!selected.size} onSelect={() => research({ fieldIds: researchable.filter((f) => f.type === "AI_RESEARCH").map((f) => f.id).length ? researchable.filter((f) => f.type === "AI_RESEARCH").map((f) => f.id) : researchable.map((f) => f.id), rowIds: [...selected], scope: "ROWS" })}>
                  <Sparkles /> Selected rows ({selected.size})
                </MenuItem>
                <MenuSeparator />
                <MenuLabel>Discover</MenuLabel>
                <MenuItem onSelect={() => start(async () => { const r = await planVerification(workspaceId, { datasetId: dataset.id, rowIds: selected.size ? [...selected] : [] }); if (!r.ok) toast.error(r.error); else setPlan(r.data); })}>
                  <ShieldCheck /> Verify employers exist online{selected.size ? ` (${selected.size})` : ""}
                </MenuItem>
                <MenuItem onSelect={() => start(async () => { const r = await planDiscovery(workspaceId, { scope: "DISCOVER_COMPANIES", objective: "", datasetId: dataset.id, maxResults: 20 }); if (!r.ok) toast.error(r.error); else setPlan(r.data); })}>
                  <Plus /> More employers like these
                </MenuItem>
              </MenuContent>
            </Menu>
          ) : null}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search this table" value={view.search} onChange={(e) => setView({ ...view, search: e.target.value })} aria-label="Search" />
        </div>
        <FilterMenu fields={fields} view={view} setView={setView} />
        <Select className="h-8 w-auto text-[13px]" value={triage} onChange={(e) => setTriage(e.target.value as typeof triage)} aria-label="Show employers">
          <option value="ALL">All employers</option>
          <option value="HIGH">High priority only</option>
          <option value="ACTIVE">Hide excluded</option>
          <option value="UNVERIFIED">Not yet verified online</option>
          <option value="NOT_FOUND">Not found / to confirm</option>
        </Select>
        <Menu>
          <MenuTrigger asChild><Button variant="outline" size="sm"><Group /> {view.groupBy ? `Grouped: ${fields.find((f) => f.id === view.groupBy)?.name}` : "Group"}</Button></MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => setView({ ...view, groupBy: null })}>No grouping</MenuItem>
            <MenuSeparator />
            {fields.filter((f) => ["SINGLE_SELECT", "BOOLEAN", "TEXT", "MULTI_SELECT"].includes(storageType(f)) && !f.isPrimary).map((f) => (
              <MenuItem key={f.id} onSelect={() => setView({ ...view, groupBy: f.id })}>{f.name}</MenuItem>
            ))}
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger asChild><Button variant="outline" size="sm"><Columns3 /> Columns{hiddenIds.size ? ` (${hiddenIds.size} hidden)` : ""}</Button></MenuTrigger>
          <MenuContent className="max-h-80 overflow-y-auto">
            {fields.map((f) => (
              <MenuItem key={f.id} onSelect={(e) => { e.preventDefault(); if (f.isPrimary) return; const h = new Set(view.hidden); if (h.has(f.id)) h.delete(f.id); else h.add(f.id); setView({ ...view, hidden: [...h] }); }}>
                <input type="checkbox" readOnly checked={!hiddenIds.has(f.id)} disabled={f.isPrimary} className="pointer-events-none" /> {f.name}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
        <ViewsMenu workspaceId={workspaceId} datasetId={dataset.id} views={views} view={view} active={activeView} onPick={(id, cfg) => { setActiveView(id); setView(cfg); }} />
        {canEdit ? <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}><Plus /> Field</Button> : null}
        <span className="ml-auto text-xs text-muted-foreground">{shown} of {rows.length} rows</span>
      </div>

      {selected.size > 0 && canEdit ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-accent/40 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => research({ fieldIds: researchable.map((f) => f.id), rowIds: [...selected], scope: selected.size === 1 ? "ROW" : "ROWS" })}><Sparkles /> Research selected</Button>
          <Button size="sm" variant="outline" onClick={() => start(async () => { if (!confirm(`Delete ${selected.size} row(s)? This cannot be undone.`)) return; const r = await deleteRows(workspaceId, [...selected]); if (!r.ok) toast.error(r.error); else { toast.success(`${r.data.deleted} row(s) deleted`); setSelected(new Set()); router.refresh(); } })}><Trash2 /> Delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      ) : null}

      {/* Table */}
      <div className="overflow-auto rounded-lg border bg-card" style={{ maxHeight: "calc(100vh - 240px)" }}>
        <table className="border-separate border-spacing-0 text-sm" style={{ minWidth: "100%" }} role="grid" aria-label={dataset.name}>
          <thead className="sticky top-0 z-20 bg-muted/80 backdrop-blur">
            <tr>
              <th className="sticky left-0 z-30 w-10 min-w-10 max-w-10 border-b border-r bg-muted px-2 py-2">
                <input type="checkbox" aria-label="Select all rows" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.map((r) => r.id)))} />
              </th>
              {visible.map((f) => (
                <th key={f.id} style={{ width: widths[f.id], minWidth: widths[f.id], maxWidth: widths[f.id] }} className={cn("group relative border-b border-r px-2 py-1.5 text-left text-xs font-medium text-muted-foreground", f.isPrimary && "sticky left-10 z-30 bg-muted")}>
                  <div className="flex items-center gap-1">
                    <button className="flex min-w-0 flex-1 items-center gap-1 truncate text-left hover:text-foreground" onClick={() => setView({ ...view, sort: view.sort?.fieldId === f.id ? (view.sort.dir === "asc" ? { fieldId: f.id, dir: "desc" } : null) : { fieldId: f.id, dir: "asc" } })} title={`${f.name} · ${FIELD_TYPE_LABELS[f.type]}${f.researchPrompt ? `\nResearch: ${f.researchPrompt}` : ""}`}>
                      {f.type === "AI_RESEARCH" ? <Sparkles className="size-3 shrink-0 text-primary" /> : null}
                      <span className="truncate">{f.name}</span>
                      {view.sort?.fieldId === f.id ? (view.sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : null}
                    </button>
                    {canEdit ? (
                      <Menu>
                        <MenuTrigger className="rounded p-0.5 opacity-60 hover:bg-background group-hover:opacity-100" aria-label={`${f.name} options`}><MoreHorizontal className="size-3.5" /></MenuTrigger>
                        <MenuContent>
                          <MenuItem onSelect={() => setFieldDialog(f)}><Pencil /> Edit field</MenuItem>
                          {!f.isPrimary && f.type !== "FORMULA" ? <MenuItem onSelect={() => research({ fieldIds: [f.id], rowIds: [], scope: "COLUMN" })}><Sparkles /> Research this column</MenuItem> : null}
                          <MenuItem onSelect={() => setView({ ...view, sort: { fieldId: f.id, dir: "asc" } })}><ArrowUp /> Sort ascending</MenuItem>
                          <MenuItem onSelect={() => setView({ ...view, sort: { fieldId: f.id, dir: "desc" } })}><ArrowDown /> Sort descending</MenuItem>
                          <MenuItem onSelect={() => start(async () => { await moveField(workspaceId, f.id, -1); router.refresh(); })}><ArrowLeft /> Move left</MenuItem>
                          <MenuItem onSelect={() => start(async () => { await moveField(workspaceId, f.id, 1); router.refresh(); })}><ArrowRight /> Move right</MenuItem>
                          {!f.isPrimary ? <MenuItem onSelect={() => start(async () => { await updateField(workspaceId, f.id, { hidden: true }); router.refresh(); })}><EyeOff /> Hide for everyone</MenuItem> : null}
                          {!f.isPrimary ? <><MenuSeparator /><MenuItem danger onSelect={() => start(async () => { if (!confirm(`Delete the field "${f.name}" and all its values?`)) return; const r = await deleteField(workspaceId, f.id); if (!r.ok) toast.error(r.error); router.refresh(); })}><Trash2 /> Delete field</MenuItem></> : null}
                        </MenuContent>
                      </Menu>
                    ) : null}
                  </div>
                  <span role="separator" aria-orientation="vertical" aria-label={`Resize ${f.name}`} onPointerDown={(e) => startResize(e, f)} className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-primary/30" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key || "all"}>
                {view.groupBy ? (
                  <tr><td colSpan={visible.length + 1} className="sticky left-0 border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold">{g.key} <span className="font-normal text-muted-foreground">· {g.rows.length}</span></td></tr>
                ) : null}
                {g.rows.map((r) => {
                  if (rendered++ >= limit) return null;
                  return (
                    <tr key={r.id} className={cn("group/row", selected.has(r.id) && "bg-accent/30")}>
                      <td className="sticky left-0 z-10 w-10 min-w-10 max-w-10 border-b border-r bg-card px-2 py-1.5 align-top">
                        <input type="checkbox" aria-label="Select row" checked={selected.has(r.id)} onChange={() => { const s = new Set(selected); if (s.has(r.id)) s.delete(r.id); else s.add(r.id); setSelected(s); }} />
                      </td>
                      {visible.map((f) => (
                        <Cell
                          key={f.id}
                          field={f}
                          row={r}
                          width={widths[f.id]}
                          editing={editing?.rowId === r.id && editing.fieldId === f.id}
                          canEdit={canEdit && f.type !== "FORMULA"}
                          onEdit={() => setEditing({ rowId: r.id, fieldId: f.id })}
                          onCancel={() => setEditing(null)}
                          onSave={(v) => saveCell(r.id, f, v)}
                          onOpen={() => setDetail(r.id)}
                          onResearch={canEdit && !f.isPrimary && f.type !== "FORMULA" ? () => research({ fieldIds: [f.id], rowIds: [r.id], scope: "CELL" }) : undefined}
                        />
                      ))}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
        {shown === 0 && rows.length > 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No rows match your search or filters.</p> : null}
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            This table is empty. <Link className="text-primary hover:underline" href={`/app/w/${workspaceId}/import`}>Import a spreadsheet</Link>, add a row above, or use <b>Research → More employers</b>.
          </div>
        ) : null}
      </div>
      {canEdit ? (
        <form className="flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const res = await addRow(workspaceId, dataset.id, newRow); if (!res.ok) return void toast.error(res.error); setNewRow(""); router.refresh(); }); }}>
          <Input className="h-8" value={newRow} onChange={(e) => setNewRow(e.target.value)} placeholder={`+ Add ${primary?.name.toLowerCase() ?? "row"}`} aria-label="New row name" />
          {newRow ? <Button size="sm" type="submit">Add</Button> : null}
        </form>
      ) : null}
      {shown > limit ? <div className="text-center"><Button variant="outline" size="sm" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, shown - limit)} more</Button></div> : null}

      <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {Object.entries({ VERIFIED: "Verified (official source)", REPORTED: "Reported (third party)", ESTIMATED: "Estimated", CONFLICTING: "Conflicting", UNKNOWN: "Researched, unknown" }).map(([k, l]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className={cn("size-2 rounded-full", CONF_DOT[k])} /> {l}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><Lock className="size-3" /> Confirmed by you (never overwritten)</span>
      </p>

      <PlanReviewDialog workspaceId={workspaceId} plan={plan} onClose={() => { setPlan(null); router.refresh(); }} />
      <AddFieldDialog open={addOpen} onOpenChange={setAddOpen} workspaceId={workspaceId} datasetId={dataset.id} fields={fields} />
      <EditFieldDialog workspaceId={workspaceId} field={fieldDialog} onClose={() => setFieldDialog(null)} />
      <RowDetail
        workspaceId={workspaceId}
        rowId={detail}
        fields={fields}
        row={computed.find((r) => r.id === detail) ?? null}
        canEdit={canEdit}
        locations={locations}
        onClose={() => setDetail(null)}
        onResearch={(fieldIds) => detail && research({ fieldIds, rowIds: [detail], scope: fieldIds.length === 1 ? "CELL" : "ROW" })}
        onSave={(f, v) => detail && saveCell(detail, f, v)}
      />
    </div>
  );
}

function Cell({ field, row, width, editing, canEdit, onEdit, onCancel, onSave, onOpen, onResearch }: {
  field: GridField; row: GridRow; width: number; editing: boolean; canEdit: boolean; onEdit: () => void; onCancel: () => void; onSave: (v: string) => void; onOpen: () => void; onResearch?: () => void;
}) {
  const c = row.cells[field.id];
  const t = storageType(field);
  const ref = useRef<HTMLTableCellElement>(null);
  const style = { width, minWidth: width, maxWidth: width };
  const base = cn("border-b border-r px-2 py-1.5 align-top", field.isPrimary && "sticky left-10 z-10 bg-card font-medium");
  if (editing) {
    return (
      <td className={cn(base, "p-0.5")} style={style}>
        <CellEditor field={field} initial={c?.raw ?? ""} onSave={onSave} onCancel={onCancel} />
      </td>
    );
  }
  return (
    <td
      ref={ref}
      className={cn(base, "cursor-default outline-none focus:ring-2 focus:ring-inset focus:ring-ring")}
      style={style}
      tabIndex={0}
      onDoubleClick={() => canEdit && onEdit()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && canEdit) { e.preventDefault(); onEdit(); }
        const moves: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
        const m = moves[e.key];
        if (m) {
          e.preventDefault();
          const td = ref.current!;
          const tr = td.parentElement as HTMLTableRowElement;
          const idx = td.cellIndex + m[1];
          const target = m[0] === 0 ? tr.cells[idx] : (m[0] > 0 ? tr.nextElementSibling : tr.previousElementSibling) as HTMLTableRowElement | null;
          const cell = m[0] === 0 ? (target as HTMLTableCellElement | undefined) : (target as HTMLTableRowElement | null)?.cells?.[td.cellIndex];
          if (cell && cell.tabIndex === 0) cell.focus();
        }
      }}
    >
      <div className="group/cell flex items-start gap-1.5">
        {c?.confidence ? <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", CONF_DOT[c.confidence])} title={`${c.confidence.toLowerCase()} · ${c.evidence} source${c.evidence === 1 ? "" : "s"}`} /> : null}
        <span className={cn("min-w-0 flex-1", t === "LONG_TEXT" ? "line-clamp-3 whitespace-pre-line" : "truncate", !c?.display && c?.confidence === "UNKNOWN" && "italic text-muted-foreground")} title={c?.display}>
          {t === "URL" && c?.display ? (
            <a href={c.display} target="_blank" rel="noopener noreferrer nofollow" className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{c.display.replace(/^https?:\/\/(www\.)?/, "")}</a>
          ) : t === "MULTI_SELECT" && c?.display ? (
            <span className="flex flex-wrap gap-1">{c.display.split(", ").map((x) => <Badge key={x}>{x}</Badge>)}</span>
          ) : t === "SINGLE_SELECT" && c?.display ? (
            <Badge variant="primary">{c.display}</Badge>
          ) : c?.display ? c.display : c?.confidence === "UNKNOWN" ? "Unknown" : ""}
        </span>
        {c?.confirmed ? <Lock className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-label="Confirmed by you" /> : null}
        {c?.suggestion ? <span className="mt-1 size-1.5 shrink-0 rounded-full bg-warning ring-2 ring-warning/30" title={`Research suggests: ${c.suggestion}`} /> : null}
        <span className="flex shrink-0 gap-0.5 opacity-0 transition group-hover/cell:opacity-100 group-focus-within/row:opacity-100">
          {field.isPrimary ? <VerifyMark row={row} /> : null}
          {field.isPrimary ? <button className="rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={onOpen} aria-label="Open details"><PanelRightOpen className="size-3.5" /></button> : null}
          {canEdit && !field.isPrimary ? <button className="rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={onEdit} aria-label={`Edit ${field.name}`}><Pencil className="size-3" /></button> : null}
          {onResearch ? <button className="rounded p-0.5 text-primary hover:bg-muted" onClick={onResearch} aria-label={`Research ${field.name}`}><Sparkles className="size-3" /></button> : null}
          {!field.isPrimary && (c?.evidence || c?.confidence) ? <button className="rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={onOpen} aria-label="View evidence"><PanelRightOpen className="size-3" /></button> : null}
        </span>
      </div>
    </td>
  );
}

const VERIFY_MARK: Record<string, [string, string, string]> = {
  VERIFIED: ["✓", "text-success", "Verified online"],
  AMBIGUOUS: ["?", "text-warning", "Referenced online, official site not found"],
  NOT_FOUND: ["!", "text-destructive", "Not found online"],
};

function VerifyMark({ row }: { row: GridRow }) {
  const m = row.verify ? VERIFY_MARK[row.verify.status] : null;
  return (
    <span className="flex shrink-0 items-center gap-0.5 opacity-100">
      {row.priority === "HIGH" ? <span className="text-warning" title="High priority">★</span> : null}
      {row.priority === "EXCLUDED" ? <span className="text-xs text-muted-foreground" title="Excluded">⊘</span> : null}
      {m ? <span className={cn("text-xs font-bold", m[1])} title={`${m[2]}${row.verify?.note ? ` · ${row.verify.note}` : ""}`} aria-label={m[2]}>{m[0]}</span> : null}
    </span>
  );
}

export function CellEditor({ field, initial, onSave, onCancel }: { field: GridField; initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const t = storageType(field);
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    if (e.key === "Enter" && !(t === "LONG_TEXT" && e.shiftKey)) { e.preventDefault(); onSave(v); }
  };
  if (t === "BOOLEAN") {
    return (
      <Select autoFocus value={v} onChange={(e) => onSave(e.target.value)} onBlur={onCancel} onKeyDown={keys} className="h-8">
        <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
      </Select>
    );
  }
  if (t === "SINGLE_SELECT" && field.options.length) {
    return (
      <Select autoFocus value={v} onChange={(e) => onSave(e.target.value)} onBlur={onCancel} onKeyDown={keys} className="h-8">
        <option value="">—</option>
        {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
    );
  }
  if (t === "LONG_TEXT") return <Textarea autoFocus rows={4} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onSave(v)} onKeyDown={keys} />;
  return <Input autoFocus className="h-8" type={t === "DATE" ? "date" : "text"} inputMode={["NUMBER", "CURRENCY", "PERCENT"].includes(t) ? "decimal" : undefined} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => (v !== initial ? onSave(v) : onCancel())} onKeyDown={keys} />;
}

function FilterMenu({ fields, view, setView }: { fields: GridField[]; view: ViewConfig; setView: (v: ViewConfig) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(view.filters);
  useEffect(() => setDraft(view.filters), [view.filters, open]);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Filter /> Filter{view.filters.length ? ` (${view.filters.length})` : ""}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Filter rows">
          <div className="space-y-2">
            {draft.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-1.5">
                <Select value={f.fieldId} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, fieldId: e.target.value } : x)))} aria-label="Field">
                  {fields.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
                <Select value={f.op} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, op: e.target.value as typeof f.op } : x)))} aria-label="Condition">
                  <option value="contains">contains</option><option value="equals">is</option><option value="gt">&gt;</option><option value="lt">&lt;</option><option value="empty">is empty</option><option value="notEmpty">is not empty</option>
                </Select>
                <Input value={f.value} disabled={f.op === "empty" || f.op === "notEmpty"} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} aria-label="Value" />
                <Button size="icon" variant="ghost" onClick={() => setDraft(draft.filter((_, j) => j !== i))} aria-label="Remove filter"><Trash2 /></Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setDraft([...draft, { fieldId: fields[0]?.id ?? "", op: "contains", value: "" }])}><Plus /> Add condition</Button>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setView({ ...view, filters: [] }); setOpen(false); }}>Clear all</Button>
            <Button onClick={() => { setView({ ...view, filters: draft }); setOpen(false); }}>Apply</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ViewsMenu({ workspaceId, datasetId, views, view, active, onPick }: { workspaceId: string; datasetId: string; views: { id: string; name: string; config: ViewConfig }[]; view: ViewConfig; active: string; onPick: (id: string, cfg: ViewConfig) => void }) {
  const router = useRouter();
  const current = views.find((v) => v.id === active);
  return (
    <Menu>
      <MenuTrigger asChild><Button variant="outline" size="sm"><Save /> {current ? current.name : "Views"}</Button></MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={() => onPick("", EMPTY_VIEW)}>Default view</MenuItem>
        {views.map((v) => (
          <MenuItem key={v.id} onSelect={() => onPick(v.id, { ...EMPTY_VIEW, ...v.config })}>
            <span className="flex-1">{v.name}</span>
            <button className="rounded p-0.5 hover:bg-background" aria-label={`Delete view ${v.name}`} onClick={async (e) => { e.stopPropagation(); e.preventDefault(); await deleteView(workspaceId, v.id); router.refresh(); }}><Trash2 className="size-3" /></button>
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={async () => {
          const name = prompt("Name this view (it saves the current search, filters, sort, grouping and hidden columns)");
          if (!name) return;
          const r = await saveView(workspaceId, datasetId, { name, config: view });
          if (!r.ok) toast.error(r.error); else { toast.success("View saved"); router.refresh(); }
        }}><Plus /> Save current view</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function EditFieldDialog({ workspaceId, field, onClose }: { workspaceId: string; field: GridField | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState("");
  const [formula, setFormula] = useState("");
  const [currency, setCurrency] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    if (field) { setName(field.name); setPrompt(field.researchPrompt ?? ""); setOptions(field.options.join(", ")); setFormula(field.formula ?? ""); setCurrency(field.currency ?? ""); }
  }, [field]);
  if (!field) return null;
  const t = storageType(field);
  return (
    <Dialog open={!!field} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Edit “${field.name}”`} description={`${FIELD_TYPE_LABELS[field.type]}${field.type === "AI_RESEARCH" && field.valueType ? ` · stores ${FIELD_TYPE_LABELS[field.valueType].toLowerCase()}` : ""}`}>
        <div className="space-y-4">
          <FormField label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></FormField>
          {!field.isPrimary && field.type !== "FORMULA" ? (
            <FormField label="Research instruction" hint="Plain language. Used whenever this column is researched, e.g. “Entry-level analyst base salary in Paris, distinguish base from bonus”.">
              <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </FormField>
          ) : null}
          {t === "SINGLE_SELECT" || t === "MULTI_SELECT" ? <FormField label="Options" hint="Comma-separated"><Input value={options} onChange={(e) => setOptions(e.target.value)} /></FormField> : null}
          {t === "CURRENCY" ? <FormField label="Default currency" hint="ISO code, e.g. EUR"><Input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></FormField> : null}
          {field.type === "FORMULA" ? <FormField label="Formula" hint="Reference fields with {Field name}. Supports + − × ÷, MIN, MAX, AVG, ROUND, IF."><Input className="font-mono" value={formula} onChange={(e) => setFormula(e.target.value)} /></FormField> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={pending} onClick={() => start(async () => {
            const r = await updateField(workspaceId, field.id, {
              name,
              ...(field.isPrimary || field.type === "FORMULA" ? {} : { researchPrompt: prompt }),
              ...(t === "SINGLE_SELECT" || t === "MULTI_SELECT" ? { options: options.split(",").map((o) => o.trim()).filter(Boolean) } : {}),
              ...(t === "CURRENCY" ? { currency: currency || null } : {}),
              ...(field.type === "FORMULA" ? { formula } : {}),
            });
            if (!r.ok) return void toast.error(r.error);
            onClose();
            router.refresh();
          })}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

