/**
 * Creates a demo account so the app can be tried immediately.
 * Only employer names and locations are pre-filled: no salaries, people or evidence are invented.
 * Usage: npx tsx scripts/seed-demo.ts
 */
import bcrypt from "bcryptjs";
import { db } from "../src/server/db";
import { DEFAULT_STAGES } from "../src/lib/constants";
import { normalizeName } from "../src/lib/fields";

const EMAIL = "demo@careerly.app";
const PASSWORD = "careerly-demo-2026";

async function main() {
  await db.user.deleteMany({ where: { email: EMAIL } });
  const user = await db.user.create({ data: { email: EMAIL, name: "Utilisateur Démo", passwordHash: await bcrypt.hash(PASSWORD, 12), locale: "fr", networkingLanguage: "fr", currency: "EUR" } });
  const ws = await db.workspace.create({
    data: {
      ownerId: user.id,
      name: "Investissement immobilier CDI 2027",
      objective: "Je suis diplômé en juin 2027 et je cherche un poste d'analyste en investissement bien rémunéré à Paris ou Londres, idéalement en private equity immobilier.",
      targetLocations: ["Paris", "Londres"],
      targetRoles: ["Analyste investissement"],
      searchLanguages: ["fr", "en"],
      members: { create: { userId: user.id, role: "OWNER" } },
      stages: { create: DEFAULT_STAGES.map(([key, label], i) => ({ key, label, position: i, terminal: key === "ACCEPTED" || key === "REJECTED" })) },
    },
  });
  const ds = await db.dataset.create({ data: { workspaceId: ws.id, name: "Fonds cibles" } });
  const name = await db.fieldDefinition.create({ data: { datasetId: ds.id, key: "company", name: "Société", type: "TEXT", isPrimary: true, coreBinding: "company.name", position: 0, width: 220 } });
  const site = await db.fieldDefinition.create({ data: { datasetId: ds.id, key: "website", name: "Site web", type: "URL", coreBinding: "company.website", position: 1 } });
  const loc = await db.fieldDefinition.create({ data: { datasetId: ds.id, key: "location", name: "Ville", type: "SINGLE_SELECT", options: ["Paris", "Londres"], position: 2 } });
  await db.fieldDefinition.create({ data: { datasetId: ds.id, key: "salaire_analyste", name: "Salaire analyste", type: "AI_RESEARCH", valueType: "CURRENCY", currency: "EUR", position: 3, width: 240, researchPrompt: "Trouver le salaire de base le plus récent d'un analyste junior au bureau de Paris. Distinguer fixe et bonus, indiquer l'année et les sources." } });
  await db.fieldDefinition.create({ data: { datasetId: ds.id, key: "programme_graduate", name: "Programme graduate", type: "AI_RESEARCH", valueType: "LONG_TEXT", position: 4, width: 280, researchPrompt: "L'employeur a-t-il un programme graduate accessible aux diplômés 2027 ? Liens officiels et dates limites vérifiées uniquement." } });
  const companies: [string, string, string][] = [
    ["Ardian", "https://www.ardian.com", "Paris"],
    ["Tikehau Capital", "https://www.tikehaucapital.com", "Paris"],
    ["Eurazeo", "https://www.eurazeo.com", "Paris"],
    ["PAI Partners", "https://www.paipartners.com", "Paris"],
    ["Wendel", "https://www.wendelgroup.com", "Paris"],
  ];
  for (const [i, [n, url, city]] of companies.entries()) {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    const c = await db.company.create({ data: { workspaceId: ws.id, name: n, normalizedName: normalizeName(n), website: url, domain } });
    const r = await db.datasetRow.create({ data: { datasetId: ds.id, companyId: c.id, position: i, importKey: normalizeName(n) } });
    await db.fieldValue.createMany({
      data: [
        { rowId: r.id, fieldId: name.id, textValue: n, origin: "MANUAL" },
        { rowId: r.id, fieldId: site.id, textValue: url, origin: "MANUAL" },
        { rowId: r.id, fieldId: loc.id, textValue: city, origin: "MANUAL" },
      ],
    });
  }
  console.log(`Demo ready: ${EMAIL} / ${PASSWORD}`);
}

main().finally(() => db.$disconnect());
