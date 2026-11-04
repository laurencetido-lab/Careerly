"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Confidence, FieldType, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { requireDataset, requireField, requireRow, requireWorkspace } from "@/server/authz";
import { action, AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { upsertSource } from "@/server/research/apply";
import { sourceTier } from "@/server/research/sources";
import { displayValue, domainOf, isUrl, normalizeName, normalizeUrl, orgNameError, parseValue, slugKey, storageType, type FieldTypeName } from "@/lib/fields";
import { evaluateFormula } from "@/lib/formula";

const p = (wid: string, did: string) => revalidatePath(`/app/w/${wid}/data/${did}`);

async function ctx(workspaceId: string) {
  const user = await requireUser();
  await requireWorkspace(user.id, workspaceId, "EDITOR");
  return user;
}

/** Inline cell edit. Records history and returns the previous raw value for undo. */
export async function updateCell(workspaceId: string, rowId: string, fieldId: string, raw: string) {
  return action(async () => {
    const user = await ctx(workspaceId);
    const row = await requireRow(workspaceId, rowId);
    const field = await requireField(workspaceId, fieldId);
    if (field.datasetId !== row.datasetId) throw new AppError("Field not found.", "NOT_FOUND");
    if (field.type === "FORMULA") throw new AppError("Formula fields are calculated automatically.", "INVALID");
    const type = storageType({ type: field.type as FieldTypeName, valueType: field.valueType as FieldTypeName | null });
    const parsed = parseValue(raw, type, { currency: field.currency });
    if (!parsed.ok) throw new AppError(parsed.error, "INVALID");
    if (type === "SINGLE_SELECT" && parsed.value.textValue && field.options.length && !field.options.includes(parsed.value.textValue)) {
      await db.fieldDefinition.update({ where: { id: field.id }, data: { options: [...field.options, parsed.value.textValue] } });
    }
    if (field.isPrimary) {
      const why = orgNameError(parsed.value.textValue ?? "");
      if (why) throw new AppError(`This is ${why}.`, "INVALID");
    }
    const existing = await db.fieldValue.findUnique({ where: { rowId_fieldId: { rowId, fieldId } } });
    const prev = displayValue(existing, type);
    const next = displayValue(parsed.value, type);
    const fv = await db.fieldValue.upsert({
      where: { rowId_fieldId: { rowId, fieldId } },
      create: { rowId, fieldId, ...parsed.value, origin: "MANUAL" },
      update: { ...parsed.value, origin: "MANUAL", confidence: null, suggestionText: null },
    });
    if (prev !== next) await db.fieldValueHistory.create({ data: { fieldValueId: fv.id, previousValue: prev || null, newValue: next || null, previousConfidence: existing?.confidence ?? null, origin: "MANUAL", reason: "Edited by user", changedById: user.id } });
    if (field.isPrimary && parsed.value.textValue) await syncCompanyName(workspaceId, row.id, parsed.value.textValue);
    if (field.coreBinding === "company.website" && row.companyId) await db.company.update({ where: { id: row.companyId }, data: { website: parsed.value.textValue, domain: domainOf(parsed.value.textValue) } });
    p(workspaceId, row.datasetId);
    return { previous: rawOf(existing, type), display: next };
  });
}

function rawOf(v: { textValue: string | null; numberValue: number | null; dateValue: Date | null; boolValue: boolean | null; listValue: string[] } | null, type: FieldTypeName) {
  if (!v) return "";
  if (type === "DATE") return v.dateValue ? v.dateValue.toISOString().slice(0, 10) : "";
  if (type === "BOOLEAN") return v.boolValue == null ? "" : v.boolValue ? "yes" : "no";
  if (type === "MULTI_SELECT") return v.listValue.join(", ");
  if (["NUMBER", "CURRENCY", "PERCENT"].includes(type)) return v.numberValue == null ? "" : String(type === "PERCENT" ? v.numberValue : v.numberValue);
  return v.textValue ?? "";
}

async function syncCompanyName(workspaceId: string, rowId: string, name: string) {
  const normalized = normalizeName(name);
  if (!normalized) return;
  const company = await db.company.upsert({
    where: { workspaceId_normalizedName: { workspaceId, normalizedName: normalized } },
    create: { workspaceId, name, normalizedName: normalized },
    update: {},
  });
  await db.datasetRow.update({ where: { id: rowId }, data: { companyId: company.id } });
}

/** Mark a value as manually confirmed: research will never overwrite it. */
export async function setConfirmed(workspaceId: string, rowId: string, fieldId: string, confirmed: boolean) {
  return action(async () => {
    await ctx(workspaceId);
    const row = await requireRow(workspaceId, rowId);
    await requireField(workspaceId, fieldId);
    await db.fieldValue.upsert({ where: { rowId_fieldId: { rowId, fieldId } }, create: { rowId, fieldId, manuallyConfirmed: confirmed }, update: { manuallyConfirmed: confirmed } });
    p(workspaceId, row.datasetId);
    return null;
  });
}

/** Dismiss a research suggestion on a manually confirmed value (the confirmed value stays). */
export async function dismissSuggestion(workspaceId: string, rowId: string, fieldId: string) {
  return action(async () => {
    await ctx(workspaceId);
    const row = await requireRow(workspaceId, rowId);
    await db.fieldValue.updateMany({ where: { rowId, fieldId, row: { dataset: { workspaceId } } }, data: { suggestionText: null } });
    p(workspaceId, row.datasetId);
    return null;
  });
}

const ManualSchema = z.object({
  value: z.string().max(2000),
  sourceUrl: z.string().max(2000).refine((u) => isUrl(u), "Enter the URL of the source"),
  excerpt: z.string().trim().min(3, "Paste the passage that supports the value").max(2000),
  confidence: z.enum(["VERIFIED", "REPORTED", "ESTIMATED", "CONFLICTING"]),
  notes: z.string().max(1000).optional(),
});

/** Manual research workflow: user records a value with its source and evidence. */
export async function addManualEvidence(workspaceId: string, rowId: string, fieldId: string, input: unknown) {
  return action(async () => {
    const user = await ctx(workspaceId);
    const row = await requireRow(workspaceId, rowId);
    const field = await requireField(workspaceId, fieldId);
    const data = ManualSchema.parse(input);
    const type = storageType({ type: field.type as FieldTypeName, valueType: field.valueType as FieldTypeName | null });
    const parsed = parseValue(data.value, type, { currency: field.currency });
    if (!parsed.ok) throw new AppError(parsed.error, "INVALID");
    const company = row.companyId ? await db.company.findUnique({ where: { id: row.companyId } }) : null;
    const url = normalizeUrl(data.sourceUrl);
    const tier = sourceTier(url, [company?.domain]);
    const existing = await db.fieldValue.findUnique({ where: { rowId_fieldId: { rowId, fieldId } } });
    const fv = await db.fieldValue.upsert({
      where: { rowId_fieldId: { rowId, fieldId } },
      create: { rowId, fieldId, ...parsed.value, origin: "MANUAL", confidence: data.confidence as Confidence, researchedAt: new Date(), researchNotes: data.notes ?? null },
      update: { ...parsed.value, origin: "MANUAL", confidence: data.confidence as Confidence, researchedAt: new Date(), researchNotes: data.notes ?? null, suggestionText: null },
    });
    const prev = displayValue(existing, type);
    const next = displayValue(parsed.value, type);
    if (prev !== next) await db.fieldValueHistory.create({ data: { fieldValueId: fv.id, previousValue: prev || null, newValue: next || null, previousConfidence: existing?.confidence ?? null, newConfidence: data.confidence as Confidence, origin: "MANUAL", reason: "Manual research", changedById: user.id } });
    const src = await upsertSource({ url, title: null, tier });
    await db.researchEvidence.create({ data: { workspaceId, fieldValueId: fv.id, sourceId: src.id, value: next, excerpt: data.excerpt, confidence: data.confidence as Confidence, retrievedAt: new Date(), origin: "MANUAL", notes: data.notes } });
    p(workspaceId, row.datasetId);
    return null;
  });
}

export async function addRow(workspaceId: string, datasetId: string, name: string) {
  return action(async () => {
    await ctx(workspaceId);
    await requireDataset(workspaceId, datasetId);
    const clean = name.trim().slice(0, 200);
    if (!clean) throw new AppError("Enter a name.", "INVALID");
    const why = orgNameError(clean);
    if (why) throw new AppError(`“${clean.slice(0, 40)}” is ${why}.`, "INVALID");
    const primary = await db.fieldDefinition.findFirst({ where: { datasetId, isPrimary: true } });
    const count = await db.datasetRow.aggregate({ where: { datasetId }, _max: { position: true } });
    const normalized = normalizeName(clean);
    const company = normalized
      ? await db.company.upsert({ where: { workspaceId_normalizedName: { workspaceId, normalizedName: normalized } }, create: { workspaceId, name: clean, normalizedName: normalized }, update: {} })
      : null;
    const row = await db.datasetRow.create({ data: { datasetId, companyId: company?.id, position: (count._max.position ?? -1) + 1, importKey: normalized || null } });
    if (primary) await db.fieldValue.create({ data: { rowId: row.id, fieldId: primary.id, textValue: clean, origin: "MANUAL" } });
    p(workspaceId, datasetId);
    return { rowId: row.id };
  });
}

export async function deleteRows(workspaceId: string, rowIds: string[]) {
  return action(async () => {
    const user = await ctx(workspaceId);
    const ids = z.array(z.string()).max(5000).parse(rowIds);
    const rows = await db.datasetRow.findMany({ where: { id: { in: ids }, dataset: { workspaceId } }, select: { id: true, datasetId: true } });
    await db.datasetRow.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    await audit({ userId: user.id, workspaceId, action: "rows.delete", detail: `${rows.length} rows` });
    if (rows[0]) p(workspaceId, rows[0].datasetId);
    return { deleted: rows.length };
  });
}

const FieldSchema = z.object({
  name: z.string().trim().min(1, "Name the field").max(80),
  type: z.enum(["TEXT", "LONG_TEXT", "NUMBER", "CURRENCY", "PERCENT", "DATE", "BOOLEAN", "SINGLE_SELECT", "MULTI_SELECT", "URL", "EMAIL", "FORMULA", "AI_RESEARCH", "SOURCE_REF"]),
  valueType: z.enum(["TEXT", "LONG_TEXT", "NUMBER", "CURRENCY", "PERCENT", "DATE", "BOOLEAN", "URL"]).nullable().optional(),
  options: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  currency: z.string().length(3).nullable().optional(),
  formula: z.string().max(500).nullable().optional(),
  researchPrompt: z.string().max(2000).nullable().optional(),
});

function checkFormula(formula: string | null | undefined, names: string[]) {
  if (!formula) throw new AppError("Write a formula, e.g. {Base salary} + {Bonus}", "INVALID");
  try {
    evaluateFormula(formula, (ref) => {
      if (!names.some((n) => n.toLowerCase() === ref.toLowerCase())) throw new Error(`Unknown field {${ref}}`);
      return 1;
    });
  } catch (e) {
    throw new AppError(`Formula error: ${(e as Error).message}`, "INVALID");
  }
}

export async function addField(workspaceId: string, datasetId: string, input: unknown) {
  return action(async () => {
    await ctx(workspaceId);
    await requireDataset(workspaceId, datasetId);
    const d = FieldSchema.parse(input);
    const fields = await db.fieldDefinition.findMany({ where: { datasetId } });
    if (fields.some((f) => f.name.toLowerCase() === d.name.toLowerCase())) throw new AppError("A field with this name already exists.", "CONFLICT");
    if (d.type === "FORMULA") checkFormula(d.formula, fields.map((f) => f.name));
    let key = slugKey(d.name);
    while (fields.some((f) => f.key === key)) key = `${key}_${fields.length}`;
    const f = await db.fieldDefinition.create({
      data: {
        datasetId, key, name: d.name, type: d.type as FieldType, valueType: d.type === "AI_RESEARCH" ? ((d.valueType ?? "TEXT") as FieldType) : null,
        options: d.options, currency: d.currency ?? null, formula: d.type === "FORMULA" ? d.formula : null, researchPrompt: d.researchPrompt ?? null,
        position: fields.reduce((a, x) => Math.max(a, x.position), -1) + 1, width: d.type === "LONG_TEXT" || d.type === "AI_RESEARCH" ? 260 : 180,
      },
    });
    p(workspaceId, datasetId);
    return { fieldId: f.id };
  });
}

export async function updateField(workspaceId: string, fieldId: string, input: { name?: string; researchPrompt?: string | null; hidden?: boolean; width?: number; options?: string[]; formula?: string | null; currency?: string | null }) {
  return action(async () => {
    await ctx(workspaceId);
    const f = await requireField(workspaceId, fieldId);
    const data: Prisma.FieldDefinitionUpdateInput = {};
    if (input.name !== undefined) {
      const name = z.string().trim().min(1).max(80).parse(input.name);
      const clash = await db.fieldDefinition.findFirst({ where: { datasetId: f.datasetId, id: { not: f.id }, name: { equals: name, mode: "insensitive" } } });
      if (clash) throw new AppError("A field with this name already exists.", "CONFLICT");
      data.name = name;
    }
    if (input.researchPrompt !== undefined) data.researchPrompt = input.researchPrompt?.slice(0, 2000) || null;
    if (input.hidden !== undefined) data.hidden = input.hidden;
    if (input.width !== undefined) data.width = Math.max(80, Math.min(640, Math.round(input.width)));
    if (input.options !== undefined) data.options = z.array(z.string().trim().min(1).max(60)).max(50).parse(input.options);
    if (input.currency !== undefined) data.currency = input.currency ? z.string().length(3).parse(input.currency.toUpperCase()) : null;
    if (input.formula !== undefined && f.type === "FORMULA") {
      const names = (await db.fieldDefinition.findMany({ where: { datasetId: f.datasetId, id: { not: f.id } } })).map((x) => x.name);
      checkFormula(input.formula, names);
      data.formula = input.formula;
    }
    await db.fieldDefinition.update({ where: { id: f.id }, data });
    p(workspaceId, f.datasetId);
    return null;
  });
}

export async function moveField(workspaceId: string, fieldId: string, dir: -1 | 1) {
  return action(async () => {
    await ctx(workspaceId);
    const f = await requireField(workspaceId, fieldId);
    const fields = await db.fieldDefinition.findMany({ where: { datasetId: f.datasetId }, orderBy: { position: "asc" } });
    const i = fields.findIndex((x) => x.id === f.id);
    const j = i + dir;
    if (j < 0 || j >= fields.length) return null;
    [fields[i], fields[j]] = [fields[j], fields[i]];
    await db.$transaction(fields.map((x, k) => db.fieldDefinition.update({ where: { id: x.id }, data: { position: k } })));
    p(workspaceId, f.datasetId);
    return null;
  });
}

export async function deleteField(workspaceId: string, fieldId: string) {
  return action(async () => {
    const user = await ctx(workspaceId);
    const f = await requireField(workspaceId, fieldId);
    if (f.isPrimary) throw new AppError("The name field cannot be deleted.", "INVALID");
    await db.fieldDefinition.delete({ where: { id: f.id } });
    await audit({ userId: user.id, workspaceId, action: "field.delete", targetId: f.id, detail: f.name });
    p(workspaceId, f.datasetId);
    return null;
  });
}

export async function renameDataset(workspaceId: string, datasetId: string, name: string) {
  return action(async () => {
    await ctx(workspaceId);
    await requireDataset(workspaceId, datasetId);
    await db.dataset.update({ where: { id: datasetId }, data: { name: z.string().trim().min(1).max(120).parse(name) } });
    p(workspaceId, datasetId);
    return null;
  });
}

export async function deleteDataset(workspaceId: string, datasetId: string) {
  return action(async () => {
    const user = await ctx(workspaceId);
    await requireDataset(workspaceId, datasetId);
    await db.dataset.delete({ where: { id: datasetId } });
    await audit({ userId: user.id, workspaceId, action: "dataset.delete", targetId: datasetId });
    revalidatePath(`/app/w/${workspaceId}/data`);
    return null;
  });
}

export async function createDataset(workspaceId: string, name: string) {
  return action(async () => {
    await ctx(workspaceId);
    const ds = await db.dataset.create({ data: { workspaceId, name: z.string().trim().min(1).max(120).parse(name), entityType: "COMPANY" } });
    await db.fieldDefinition.createMany({
      data: [
        { datasetId: ds.id, key: "company", name: "Company", type: "TEXT", isPrimary: true, coreBinding: "company.name", position: 0, width: 220 },
        { datasetId: ds.id, key: "website", name: "Website", type: "URL", coreBinding: "company.website", position: 1 },
      ],
    });
    return { datasetId: ds.id };
  });
}

const ViewSchema = z.object({
  name: z.string().trim().min(1).max(60),
  config: z.object({
    sort: z.object({ fieldId: z.string(), dir: z.enum(["asc", "desc"]) }).nullable(),
    filters: z.array(z.object({ fieldId: z.string(), op: z.enum(["contains", "equals", "gt", "lt", "empty", "notEmpty"]), value: z.string().max(200) })).max(10),
    hidden: z.array(z.string()).max(200),
    groupBy: z.string().nullable(),
    search: z.string().max(200),
  }),
});

export async function saveView(workspaceId: string, datasetId: string, input: unknown) {
  return action(async () => {
    const user = await requireUser();
    await requireWorkspace(user.id, workspaceId, "VIEWER");
    await requireDataset(workspaceId, datasetId);
    const d = ViewSchema.parse(input);
    const v = await db.savedView.create({ data: { datasetId, userId: user.id, name: d.name, config: d.config } });
    p(workspaceId, datasetId);
    return { viewId: v.id };
  });
}

export async function deleteView(workspaceId: string, viewId: string) {
  return action(async () => {
    const user = await requireUser();
    await requireWorkspace(user.id, workspaceId, "VIEWER");
    const v = await db.savedView.findFirst({ where: { id: viewId, userId: user.id, dataset: { workspaceId } } });
    if (!v) throw new AppError("View not found.", "NOT_FOUND");
    await db.savedView.delete({ where: { id: v.id } });
    p(workspaceId, v.datasetId);
    return null;
  });
}

/** Full details for the row side panel: evidence and history per field. */
export async function getRowDetail(workspaceId: string, rowId: string) {
  return action(async () => {
    const user = await requireUser();
    await requireWorkspace(user.id, workspaceId, "VIEWER");
    const row = await db.datasetRow.findFirst({
      where: { id: rowId, dataset: { workspaceId } },
      include: {
        company: { include: { _count: { select: { contacts: true, opportunities: true } } } },
        values: {
          include: {
            evidence: { include: { source: true }, orderBy: { verifiedAt: "desc" } },
            history: { orderBy: { createdAt: "desc" }, take: 10 },
          },
        },
      },
    });
    if (!row) throw new AppError("Row not found.", "NOT_FOUND");
    return {
      id: row.id,
      company: row.company ? { id: row.company.id, name: row.company.name, website: row.company.website, contacts: row.company._count.contacts, opportunities: row.company._count.opportunities } : null,
      values: row.values.map((v) => ({
        fieldId: v.fieldId,
        notes: v.researchNotes,
        confidence: v.confidence,
        researchedAt: v.researchedAt?.toISOString() ?? null,
        suggestion: v.suggestionText,
        confirmed: v.manuallyConfirmed,
        origin: v.origin,
        evidence: v.evidence.map((e) => ({ id: e.id, url: e.source.url, title: e.source.title, domain: e.source.domain, tier: e.source.tier, excerpt: e.excerpt, value: e.value, confidence: e.confidence, publishedAt: e.source.publishedAt?.toISOString() ?? null, retrievedAt: e.retrievedAt.toISOString(), verifiedAt: e.verifiedAt.toISOString(), origin: e.origin, jobId: e.researchJobId })),
        history: v.history.map((h) => ({ id: h.id, previous: h.previousValue, next: h.newValue, reason: h.reason, origin: h.origin, at: h.createdAt.toISOString(), confidence: h.newConfidence })),
      })),
    };
  });
}
