import { domainOf } from "@/lib/fields";

const ATS = ["greenhouse.io", "lever.co", "myworkdayjobs.com", "workday.com", "smartrecruiters.com", "ashbyhq.com", "teamtailor.com", "recruitee.com", "workable.com", "icims.com", "taleo.net", "successfactors.com", "successfactors.eu", "jobvite.com", "welcometothejungle.com", "breezy.hr", "personio.de", "personio.com", "bamboohr.com", "eightfold.ai", "oraclecloud.com"];
const REPUTABLE = ["ft.com", "bloomberg.com", "reuters.com", "wsj.com", "economist.com", "lesechos.fr", "lefigaro.fr", "agefi.fr", "cfnews.net", "efinancialcareers.com", "efinancialcareers.fr", "efinancialcareers.co.uk", "cnbc.com", "forbes.com", "businessinsider.com", "pitchbook.com", "privateequityinternational.com", "pere news", "perenews.com", "realassets.ipe.com", "ipe.com", "techcrunch.com", "theguardian.com", "nytimes.com", "handelsblatt.com", "nzz.ch", "lemonde.fr", "challenges.fr", "fnlondon.com", "news.efinancialcareers.com"];
const SALARY = ["glassdoor.com", "glassdoor.fr", "glassdoor.co.uk", "levels.fyi", "payscale.com", "indeed.com", "indeed.fr", "salary.com", "wallstreetoasis.com", "comparably.com", "talent.com", "jobted.com", "welcometothejungle.com/fr/pages"];

function matches(domain: string, list: string[]) {
  return list.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Sites whose pages describe a company in general (not official). */
export const NON_OFFICIAL_HOSTS = ["linkedin.com", "wikipedia.org", "crunchbase.com", "glassdoor.com", "indeed.com"];

/**
 * Source hierarchy: 1 official company domain · 2 official ATS / programme pages ·
 * 3 reputable publications · 4 salary-reporting platforms · 5 other public sources.
 */
export function sourceTier(url: string, companyDomains: (string | null | undefined)[]) {
  const d = domainOf(url);
  if (!d) return 5;
  const official = companyDomains.filter(Boolean).map((x) => x!.replace(/^www\./, "").toLowerCase());
  if (official.some((o) => d === o || d.endsWith(`.${o}`))) return 1;
  if (matches(d, ATS)) return 2;
  if (matches(d, REPUTABLE)) return 3;
  if (matches(d, SALARY)) return 4;
  return 5;
}

export const TIER_LABEL: Record<number, string> = {
  1: "Official company site",
  2: "Official careers / ATS page",
  3: "Reputable publication",
  4: "Salary-reporting platform",
  5: "Other public source",
};
