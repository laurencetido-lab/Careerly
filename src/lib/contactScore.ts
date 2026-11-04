/**
 * Transparent, rule-based contact relevance. No response probabilities are produced.
 * Each point comes with a human-readable reason.
 */
export interface ContactLike {
  title?: string | null;
  team?: string | null;
  location?: string | null;
  alumniOf?: string | null;
  isRecruiter?: boolean;
  hasInteractions?: boolean;
}

export interface Target {
  roles: string[];
  locations: string[];
}

const JUNIOR = /\b(analyst|analyste|associate|associé|junior|graduate|consultant|engineer|ingénieur|developer)\b/i;
const MID = /\b(senior associate|vice president|vp|manager|principal|director|directeur|lead)\b/i;
const SENIOR = /\b(partner|managing director|md|head of|chief|ceo|cfo|cto|founder|président|president)\b/i;
const RECRUIT = /\b(recruit|talent|campus|graduate recruitment|hr|human resources|people|rh|recrutement)\b/i;

function words(s: string) {
  return s.toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((w) => w.length > 2);
}

export function scoreContact(c: ContactLike, t: Target) {
  const reasons: string[] = [];
  let score = 0;
  const title = `${c.title ?? ""} ${c.team ?? ""}`;
  const roleWords = new Set(t.roles.flatMap(words));
  const overlap = words(title).filter((w) => roleWords.has(w));
  if (overlap.length) {
    score += 30;
    reasons.push(`Role matches your target (${Array.from(new Set(overlap)).slice(0, 3).join(", ")})`);
  }
  if (c.location && t.locations.some((l) => c.location!.toLowerCase().includes(l.toLowerCase()))) {
    score += 20;
    reasons.push(`Based in ${c.location}`);
  }
  if (SENIOR.test(title)) {
    score += 5;
    reasons.push("Senior: useful for strategy, less likely to know day-to-day details");
  } else if (MID.test(title)) {
    score += 15;
    reasons.push("Associate/manager level: good for team knowledge");
  } else if (JUNIOR.test(title)) {
    score += 20;
    reasons.push("Junior professional: best for day-to-day insight");
  }
  if (c.isRecruiter || RECRUIT.test(title)) {
    score += 15;
    reasons.push("Works in recruitment: can explain the hiring process");
  }
  if (c.alumniOf) {
    score += 20;
    reasons.push(`Alumni connection you confirmed: ${c.alumniOf}`);
  }
  if (c.hasInteractions) {
    score += 10;
    reasons.push("You already have a relationship");
  }
  return { score: Math.min(100, score), reasons };
}
