import type { Confidence, FieldDefinition, ValueOrigin } from "@prisma/client";
import { displayValue, domainOf, storageType, type FieldTypeName, type TypedValue } from "@/lib/fields";
import { db } from "../db";
import { notifyWorkspace } from "../notifications";
import type { SourceDoc } from "./verify";

export interface ResearchOutcome {
  value: TypedValue | null;
  confidence: Confidence;
  notes: string | null;
  evidence: { source: SourceDoc & { publishedAt?: string | null; fetchedAt?: Date }; excerpt: string; valueInSource?: string | null }[];
}

export async function upsertSource(s: { url: string; title: string | null; tier: number; publishedAt?: string | null }) {
  const publishedAt = s.publishedAt && !Number.isNaN(Date.parse(s.publishedAt)) ? new Date(s.publishedAt) : null;
  return db.researchSource.upsert({
    where: { url: s.url },
    create: { url: s.url, domain: domainOf(s.url) ?? "unknown", title: s.title?.slice(0, 500) ?? null, tier: s.tier, publishedAt },
    update: { title: s.title?.slice(0, 500) ?? undefined, tier: s.tier, publishedAt: publishedAt ?? undefined },
  });
}

/**
 * Persist a research result for one cell.
 * - Previous values are preserved in FieldValueHistory.
 * - Manually confirmed values are never overwritten: the new finding is stored as a suggestion.
 * - A material change during monitoring triggers a (deduplicated) notification.
 */
export async function applyResearchResult(args: {
  workspaceId: string;
  jobId: string;
  rowId: string;
  field: FieldDefinition;
  outcome: ResearchOutcome;
  reason: string;
  notifyChanges: boolean;
  rowLabel: string;
  datasetId: string;
}) {
  const { field, outcome } = args;
  const type = storageType({ type: field.type as FieldTypeName, valueType: field.valueType as FieldTypeName | null });
  const existing = await db.fieldValue.findUnique({ where: { rowId_fieldId: { rowId: args.rowId, fieldId: field.id } } });
  const oldDisplay = displayValue(existing, type);
  const newDisplay = outcome.value ? displayValue(outcome.value, type) : "";
  const now = new Date();

  // No supported value found
  if (!outcome.value || outcome.confidence === "UNKNOWN") {
    if (!existing) {
      const fv = await db.fieldValue.create({
        data: { rowId: args.rowId, fieldId: field.id, origin: "RESEARCH", confidence: "UNKNOWN", researchedAt: now, researchJobId: args.jobId, researchNotes: outcome.notes ?? "No supporting public evidence found." },
      });
      return { fieldValueId: fv.id, changed: false, status: "unknown" as const };
    }
    if (existing.origin === "RESEARCH" && !existing.manuallyConfirmed) {
      await db.fieldValue.update({ where: { id: existing.id }, data: { researchedAt: now, researchNotes: outcome.notes ?? "Re-checked: no new supporting evidence found. Previous value kept." } });
    }
    return { fieldValueId: existing.id, changed: false, status: "unknown" as const };
  }

  let fieldValueId: string;
  let changed = false;
  let status: "written" | "suggested" | "unchanged" = "written";

  if (existing?.manuallyConfirmed) {
    fieldValueId = existing.id;
    if (newDisplay !== oldDisplay) {
      await db.fieldValue.update({ where: { id: existing.id }, data: { suggestionText: `${newDisplay} (${outcome.confidence.toLowerCase()})`, researchedAt: now } });
      status = "suggested";
      await notifyWorkspace(args.workspaceId, {
        type: "NEW_EVIDENCE",
        title: `New evidence for ${field.name} · ${args.rowLabel}`,
        body: `Research found "${newDisplay}" but your confirmed value "${oldDisplay}" was kept. Review the suggestion.`,
        link: `/app/w/${args.workspaceId}/data/${args.datasetId}?row=${args.rowId}`,
        dedupeKey: `suggest:${existing.id}:${newDisplay}`,
      });
    } else status = "unchanged";
  } else {
    const data = {
      ...outcome.value,
      origin: "RESEARCH" as ValueOrigin,
      confidence: outcome.confidence,
      researchedAt: now,
      researchJobId: args.jobId,
      researchNotes: outcome.notes,
      suggestionText: null,
    };
    if (existing) {
      changed = newDisplay !== oldDisplay || existing.confidence !== outcome.confidence;
      await db.fieldValue.update({ where: { id: existing.id }, data });
      fieldValueId = existing.id;
    } else {
      changed = true;
      const fv = await db.fieldValue.create({ data: { rowId: args.rowId, fieldId: field.id, ...data } });
      fieldValueId = fv.id;
    }
    if (changed) {
      await db.fieldValueHistory.create({
        data: {
          fieldValueId,
          previousValue: oldDisplay || null,
          newValue: newDisplay,
          previousConfidence: existing?.confidence ?? null,
          newConfidence: outcome.confidence,
          origin: "RESEARCH",
          reason: args.reason,
          researchJobId: args.jobId,
        },
      });
      if (args.notifyChanges && oldDisplay && oldDisplay !== newDisplay) {
        await notifyWorkspace(args.workspaceId, {
          type: "FIELD_CHANGED",
          title: `${field.name} changed · ${args.rowLabel}`,
          body: `${oldDisplay} → ${newDisplay} (${outcome.confidence.toLowerCase()}, ${outcome.evidence.length} source${outcome.evidence.length === 1 ? "" : "s"})`,
          link: `/app/w/${args.workspaceId}/data/${args.datasetId}?row=${args.rowId}`,
          dedupeKey: `change:${fieldValueId}:${newDisplay}`,
        });
      }
    } else status = "unchanged";
  }

  for (const ev of outcome.evidence) {
    const src = await upsertSource({ url: ev.source.url, title: ev.source.title, tier: ev.source.tier, publishedAt: ev.source.publishedAt });
    const dup = await db.researchEvidence.findFirst({ where: { fieldValueId, sourceId: src.id, excerpt: ev.excerpt.slice(0, 2000) } });
    if (dup) {
      await db.researchEvidence.update({ where: { id: dup.id }, data: { verifiedAt: now, researchJobId: args.jobId, confidence: outcome.confidence, value: newDisplay } });
    } else {
      await db.researchEvidence.create({
        data: {
          workspaceId: args.workspaceId,
          fieldValueId,
          sourceId: src.id,
          value: ev.valueInSource ?? newDisplay,
          excerpt: ev.excerpt.slice(0, 2000),
          confidence: outcome.confidence,
          retrievedAt: ev.source.fetchedAt ?? now,
          researchJobId: args.jobId,
        },
      });
    }
  }
  return { fieldValueId, changed, status };
}
