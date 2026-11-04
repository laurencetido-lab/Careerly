"use server";
import { z } from "zod";
import type { FieldType } from "@prisma/client";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth";
import { requireWorkspace } from "@/server/authz";
import { action, AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { rateLimit } from "@/server/ratelimit";
import { getObject, putObject } from "@/server/storage";
import { mimeFor, validateUpload } from "@/server/files";
import { cellToString, parseWorkbook, previewSheet, validateImport, type MappingColumn } from "@/server/spreadsheet";
import { detectCurrency, domainOf, normalizeName, normalizeUrl, parseValue, slugKey, type FieldTypeName } from "@/lib/fields";

export async function uploadSpreadsheet(workspaceId: string, form: FormData) {
  return action(async () => {
    const user = await requireUser();
    await requireWorkspace(user.id, workspaceId, "EDITOR");
    rateLimit(`upload:${user.id}`, 20, 60_000);
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Choose a file to upload.", "INVALID");
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = validateUpload(file.name, buf, "SPREADSHEET");
    let sheets;
    try {
      sheets = parseWorkbook(buf);
    } catch {
      throw new AppError("This file could not be read as a spreadsheet.", "INVALID");
    }
    if (!sheets.length) throw new AppError("The spreadsheet has no data.", "INVALID");
    const { key, sha256 } = await putObject(buf);
    const rec = await db.uploadedFile.create({
      data: { userId: user.id, workspaceId, kind: "SPREADSHEET", originalName: file.name.slice(0, 200), mimeType: mimeFor(ext), sizeBytes: buf.length, storageKey: key, sha256 },
    });
    return { fileId: rec.id, fileName: rec.originalName, sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length })), preview: previewSheet(sheets[0]) };
  });
}

async function loadSheet(userId: string, workspaceId: string, fileId: string, sheetName: string) {
  await requireWorkspace(userId, workspaceId, "EDITOR");
  const f = await db.uploadedFile.findFirst({ where: { id: fileId, workspaceId, kind: "SPREADSHEET" } });
  if (!f) throw new AppError("File not found.", "NOT_FOUND");
  const sheets = parseWorkbook(await getObject(f.storageKey));
  const sheet = sheets.find((s) => s.name === sheetName);
  if (!sheet) throw new AppError("Sheet not found.", "NOT_FOUND");
  return { file: f, sheet };
}

export async function previewImport(workspaceId: string, fileId: string, sheetName: string, headerRow?: number) {
  return action(async () => {
    const user = await requireUser();
    const { sheet } = await loadSheet(user.id, workspaceId, fileId, sheetName);
    return previewSheet(sheet, headerRow === undefined ? undefined : Math.max(0, Math.min(headerRow, 20)));
  });
}

const MappingSchema = z.array(
  z.object({
    index: z.number().int().min(0).max(200),
    name: z.string().trim().min(1).max(80),
    type: z.enum(["TEXT", "LONG_TEXT", "NUMBER", "CURRENCY", "PERCENT", "DATE", "BOOLEAN", "SINGLE_SELECT", "MULTI_SELECT", "URL", "EMAIL"]),
    include: z.boolean(),
    binding: z.enum(["company.name", "company.website"]).nullable(),
  }),
);

function checkMapping(mapping: MappingColumn[]) {
  const included = mapping.filter((m) => m.include);
  if (!included.length) throw new AppError("Include at least one column.", "INVALID");
  const primaries = included.filter((m) => m.binding === "company.name");
  if (primaries.length !== 1) throw new AppError("Choose exactly one column as the employer/name column.", "INVALID");
  const names = new Set<string>();
  for (const m of included) {
    const k = m.name.toLowerCase();
    if (names.has(k)) throw new AppError(`Two columns are named "${m.name}". Rename one.`, "INVALID");
    names.add(k);
  }
}

export async function validateImportAction(workspaceId: string, fileId: string, sheetName: string, headerRow: number, mappingInput: unknown) {
  return action(async () => {
    const user = await requireUser();
    const mapping = MappingSchema.parse(mappingInput);
    checkMapping(mapping);
    const { sheet } = await loadSheet(user.id, workspaceId, fileId, sheetName);
    const res = validateImport(sheet, headerRow, mapping);
    return { ...res, issues: res.issues.slice(0, 300), issueCount: res.issues.length };
  });
}

const CommitSchema = z.object({
  fileId: z.string(),
  sheetName: z.string(),
  headerRow: z.number().int().min(0).max(20),
  datasetName: z.string().trim().min(1).max(120),
  targetDatasetId: z.string().nullable(),
  duplicates: z.enum(["skip", "keep"]),
  corrections: z.record(z.string(), z.string().max(5000)).default({}),
});

/**
 * Persist an import. New tables get one FieldDefinition per included column; re-imports into an
 * existing table match rows on the employer name and update values (never manually confirmed ones).
 */
export async function commitImport(workspaceId: string, input: unknown, mappingInput: unknown) {
  return action(async () => {
    const user = await requireUser();
    const opts = CommitSchema.parse(input);
    const mapping = MappingSchema.parse(mappingInput);
    checkMapping(mapping);
    const { file, sheet } = await loadSheet(user.id, workspaceId, opts.fileId, opts.sheetName);
    const included = mapping.filter((m) => m.include);
    const data = sheet.rows.slice(opts.headerRow + 1).slice(0, 5000);

    let dataset;
    if (opts.targetDatasetId) {
      dataset = await db.dataset.findFirst({ where: { id: opts.targetDatasetId, workspaceId } });
      if (!dataset) throw new AppError("Table not found.", "NOT_FOUND");
    } else {
      dataset = await db.dataset.create({ data: { workspaceId, name: opts.datasetName, entityType: "COMPANY", sourceFileId: file.id } });
    }

    // Fields: reuse by source column / name on re-import, otherwise create
    const existingFields = await db.fieldDefinition.findMany({ where: { datasetId: dataset.id } });
    let pos = existingFields.reduce((a, f) => Math.max(a, f.position), -1) + 1;
    const fieldFor = new Map<number, { id: string; type: FieldTypeName; currency: string | null }>();
    // Dominant currency of each currency column becomes its default ("62k" in a € column is €62,000)
    const currencyOf = new Map<number, string>();
    for (const m of included.filter((x) => x.type === "CURRENCY")) {
      const counts = new Map<string, number>();
      for (const r of data) {
        const c = detectCurrency(cellToString((r[m.index] ?? null) as never));
        if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) currencyOf.set(m.index, top[0]);
    }
    for (const m of included) {
      let f =
        (m.binding === "company.name" ? existingFields.find((x) => x.isPrimary) : undefined) ??
        existingFields.find((x) => x.sourceColumn?.toLowerCase() === m.name.toLowerCase() || x.name.toLowerCase() === m.name.toLowerCase());
      if (!f) {
        let key = slugKey(m.name);
        while (existingFields.some((x) => x.key === key)) key = `${key}_${pos}`;
        f = await db.fieldDefinition.create({
          data: {
            datasetId: dataset.id,
            key,
            name: m.name,
            type: m.type as FieldType,
            position: pos++,
            isPrimary: m.binding === "company.name" && !existingFields.some((x) => x.isPrimary),
            coreBinding: m.binding,
            sourceColumn: m.name,
            currency: currencyOf.get(m.index) ?? null,
            width: m.binding === "company.name" ? 220 : m.type === "LONG_TEXT" ? 300 : 180,
          },
        });
        existingFields.push(f);
      }
      fieldFor.set(m.index, { id: f.id, currency: f.currency, type: (f.type === "AI_RESEARCH" ? f.valueType ?? "TEXT" : f.type) as FieldTypeName });
    }

    const primary = included.find((m) => m.binding === "company.name")!;
    const website = included.find((m) => m.binding === "company.website");
    const existingRows = await db.datasetRow.findMany({ where: { datasetId: dataset.id }, select: { id: true, importKey: true, position: true } });
    const byKey = new Map(existingRows.filter((r) => r.importKey).map((r) => [r.importKey!, r.id]));
    let position = existingRows.reduce((a, r) => Math.max(a, r.position), -1) + 1;
    const seen = new Set<string>();
    let created = 0, updated = 0, skipped = 0, invalidCells = 0;

    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const rowNum = opts.headerRow + 2 + i;
      const raw = (m: MappingColumn) => opts.corrections[`${rowNum}:${m.index}`] ?? r[m.index] ?? null;
      const name = cellToString(raw(primary) as never).trim();
      const key = normalizeName(name);
      if (!key) {
        skipped++;
        continue;
      }
      if (seen.has(key) && opts.duplicates === "skip") {
        skipped++;
        continue;
      }
      seen.add(key);
      const site = website ? cellToString(raw(website) as never).trim() : "";
      const company = await db.company.upsert({
        where: { workspaceId_normalizedName: { workspaceId, normalizedName: key } },
        create: { workspaceId, name: name.slice(0, 200), normalizedName: key, website: site ? normalizeUrl(site) : null, domain: domainOf(site) },
        update: site ? { website: normalizeUrl(site), domain: domainOf(site) } : {},
      });
      let rowId = opts.duplicates === "skip" || opts.targetDatasetId ? byKey.get(key) : undefined;
      if (rowId) updated++;
      else {
        const row = await db.datasetRow.create({ data: { datasetId: dataset.id, companyId: company.id, position: position++, importKey: key } });
        rowId = row.id;
        byKey.set(key, rowId);
        created++;
      }
      for (const m of included) {
        const f = fieldFor.get(m.index)!;
        const parsed = parseValue(raw(m), f.type, { currency: f.currency });
        if (!parsed.ok) {
          invalidCells++;
          continue;
        }
        const v = parsed.value;
        const empty = v.textValue == null && v.numberValue == null && v.dateValue == null && v.boolValue == null && v.listValue.length === 0;
        const existing = await db.fieldValue.findUnique({ where: { rowId_fieldId: { rowId, fieldId: f.id } } });
        if (existing?.manuallyConfirmed) continue;
        if (empty && !existing) continue;
        if (existing) {
          if (empty) continue; // re-import never erases existing data with blanks
          await db.fieldValue.update({ where: { id: existing.id }, data: { ...v, origin: "IMPORT", confidence: null } });
        } else {
          await db.fieldValue.create({ data: { rowId, fieldId: f.id, ...v, origin: "IMPORT" } });
        }
      }
    }
    await db.dataset.update({ where: { id: dataset.id }, data: { updatedAt: new Date() } });
    await audit({ userId: user.id, workspaceId, action: "dataset.import", targetType: "Dataset", targetId: dataset.id, detail: `${file.originalName}: +${created} rows, ${updated} updated, ${skipped} skipped, ${invalidCells} invalid cells left empty` });
    return { datasetId: dataset.id, created, updated, skipped, invalidCells };
  });
}
