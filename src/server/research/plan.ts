import type { FieldDefinition, ResearchScope, User, Workspace } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { AppError } from "../errors";
import { estimateDiscoveryCredits, estimateEnrichCredits } from "../credits";
import { getProviders } from "../providers";

const QueryPlanSchema = z.object({
  items: z.array(z.object({ field: z.string(), instruction: z.string(), queries: z.array(z.string()) })),
});

const DiscoveryPlanSchema = z.object({
  interpretation: z.string(),
  queries: z.array(z.string()),
  suggested_fields: z.array(z.object({ name: z.string(), value_type: z.enum(["TEXT", "LONG_TEXT", "NUMBER", "CURRENCY", "DATE", "BOOLEAN", "URL"]), instruction: z.string() })),
});

export function defaultQueries(field: { name: string }, ws: Pick<Workspace, "targetLocations" | "searchLanguages">) {
  const q = ["{entity} {field} {location}", "{entity} {field} {year}"];
  if (/salary|salaire|compensation|rémunération|pay|bonus/i.test(field.name)) q.push("{entity} {role} salary {location}");
  if (/graduate|programme|program|intern|stage|alternance|recruit/i.test(field.name)) q.push("{entity} careers {field}");
  if (ws.searchLanguages.includes("fr")) q.push("{entity} {field} France");
  return Array.from(new Set(q)).slice(0, 3);
}

async function recordPlanningUsage(user: User, workspaceId: string, usage: { inputTokens: number; outputTokens: number }) {
  await db.usageRecord.create({ data: { userId: user.id, workspaceId, kind: "LLM", provider: "anthropic", credits: 2, ...usage } });
}

/** Plan for enriching cells. AI drafts targeted query templates when configured; otherwise templates. */
export async function createEnrichPlan(user: User, ws: Workspace, args: { datasetId: string; fields: FieldDefinition[]; rowIds: string[]; scope: ResearchScope; totalRows: number }) {
  if (!args.fields.length) throw new AppError("Choose at least one field to research.", "INVALID");
  const llm = getProviders().llm;
  let generatedBy = "TEMPLATE";
  let items = args.fields.map((f, i) => ({
    fieldId: f.id,
    instruction: f.researchPrompt?.trim() || `Find the most recent, sourced value for "${f.name}" for this employer${ws.targetLocations[0] ? ` (focus: ${ws.targetLocations.join(", ")})` : ""}.`,
    queries: defaultQueries(f, ws),
    position: i,
  }));
  if (llm) {
    try {
      const res = await llm.json({
        system:
          "You design web search queries for researching employers. For each field, write 2-3 short search-engine queries as templates using {entity} for the employer name. Include the location and, where useful, a query in the local language. Keep the user's instruction, clarified, as `instruction`. Never answer the question yourself.",
        user: JSON.stringify({
          objective: ws.objective,
          locations: ws.targetLocations,
          roles: ws.targetRoles,
          languages: ws.searchLanguages,
          fields: items.map((it) => ({ field: args.fields.find((f) => f.id === it.fieldId)!.name, instruction: it.instruction })),
        }),
        schema: QueryPlanSchema,
        maxTokens: 4000,
      });
      await recordPlanningUsage(user, ws.id, res.usage);
      items = items.map((it) => {
        const name = args.fields.find((f) => f.id === it.fieldId)!.name;
        const g = res.data.items.find((x) => x.field.toLowerCase() === name.toLowerCase());
        const qs = g?.queries.filter((q) => q.includes("{entity}")).slice(0, 3) ?? [];
        return qs.length ? { ...it, instruction: g!.instruction || it.instruction, queries: qs } : it;
      });
      generatedBy = "AI";
    } catch (e) {
      console.warn("AI planning failed, using templates", e);
    }
  }
  const rows = args.rowIds.length || args.totalRows;
  const cells = rows * items.length;
  const maxQ = Math.max(...items.map((i) => i.queries.length));
  const estimated = estimateEnrichCredits(cells, maxQ);
  return db.researchPlan.create({
    data: {
      workspaceId: ws.id,
      datasetId: args.datasetId,
      createdById: user.id,
      objective: ws.objective || "Enrich employer data",
      scope: args.scope,
      rowIds: args.rowIds,
      estimatedCredits: estimated,
      budgetCredits: estimated,
      generatedBy,
      items: { create: items },
    },
    include: { items: true },
  });
}

/** Plan for discovering employers / contacts / opportunities from a natural-language objective. */
export async function createDiscoveryPlan(
  user: User,
  ws: Workspace,
  args: { scope: "DISCOVER_COMPANIES" | "DISCOVER_CONTACTS" | "DISCOVER_OPPORTUNITIES"; objective: string; datasetId?: string | null; companyId?: string | null; maxResults: number; roles?: string[] },
) {
  const objective = args.objective.trim();
  if (objective.length < 8) throw new AppError("Describe what you are looking for in a sentence.", "INVALID");
  let queries: string[] = [];
  let interpretation = "";
  let generatedBy = "TEMPLATE";
  const loc = ws.targetLocations;
  const company = args.companyId ? await db.company.findFirst({ where: { id: args.companyId, workspaceId: ws.id } }) : null;
  if (args.companyId && !company) throw new AppError("Company not found.", "NOT_FOUND");
  const roles = args.roles?.length ? args.roles : ws.targetRoles;

  if (args.scope === "DISCOVER_CONTACTS") {
    const role = roles[0] ?? "analyst";
    queries = [
      `site:linkedin.com/in "${company!.name}" ${role} ${loc[0] ?? ""}`.trim(),
      `site:linkedin.com/in "${company!.name}" associate ${loc[0] ?? ""}`.trim(),
      `site:linkedin.com/in "${company!.name}" (recruiter OR "talent acquisition") ${loc[0] ?? ""}`.trim(),
      `"${company!.name}" team ${role}`,
    ];
    interpretation = `Find public professional profiles at ${company!.name} relevant to ${roles.join(", ") || "your target roles"}${loc.length ? ` in ${loc.join(", ")}` : ""}.`;
  } else if (args.scope === "DISCOVER_OPPORTUNITIES") {
    const y = new Date().getFullYear();
    queries = [`${company!.name} careers ${roles[0] ?? ""} ${loc[0] ?? ""}`.trim(), `${company!.name} graduate programme ${y + 1}`, `${company!.name} internship ${loc[0] ?? ""}`.trim()];
    interpretation = `Find current openings, graduate programmes and internships at ${company!.name}.`;
  } else {
    const llm = getProviders().llm;
    if (llm) {
      try {
        const res = await llm.json({
          system:
            "You turn a job seeker's objective into a web research strategy for discovering real employers. Write 4-8 precise search queries (lists, rankings, industry directories, recruitment pages), in the relevant local languages. Suggest up to 5 fields worth researching per employer, each with a clear research instruction. Do not name employers yourself.",
          user: JSON.stringify({ objective, locations: loc, roles, languages: ws.searchLanguages }),
          schema: DiscoveryPlanSchema,
          maxTokens: 4000,
        });
        await recordPlanningUsage(user, ws.id, res.usage);
        queries = res.data.queries.slice(0, 8);
        interpretation = res.data.interpretation;
        generatedBy = "AI";
      } catch (e) {
        console.warn("AI discovery planning failed", e);
      }
    }
    if (!queries.length) {
      queries = [objective, `${objective} list`, ...loc.slice(0, 2).map((l) => `${roles[0] ?? objective} employers ${l}`)];
      interpretation = `Search the web for employers matching: "${objective}".`;
    }
  }
  const estimated = estimateDiscoveryCredits(queries.length);
  return db.researchPlan.create({
    data: {
      workspaceId: ws.id,
      datasetId: args.datasetId ?? null,
      companyId: company?.id ?? null,
      createdById: user.id,
      objective: interpretation ? `${objective}\n\n${interpretation}` : objective,
      scope: args.scope,
      maxResults: args.maxResults,
      estimatedCredits: estimated,
      budgetCredits: estimated,
      generatedBy,
      items: { create: queries.map((q, i) => ({ instruction: q, queries: [q], position: i })) },
    },
    include: { items: true },
  });
}
