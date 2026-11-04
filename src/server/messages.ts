import type { User, Workspace } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { getProviders } from "./providers";
import { ProviderError } from "./providers/types";

export const PURPOSE_LABEL: Record<string, string> = {
  CONNECTION_REQUEST: "LinkedIn connection request",
  AFTER_CONNECTION: "Message after connection",
  CALL_REQUEST: "Request for a 15-minute call",
  INTRO_EMAIL: "Introductory email",
  FOLLOW_UP: "Follow-up",
  THANK_YOU: "Thank-you message",
  REFERRAL_REQUEST: "Referral request",
  EVENT_FOLLOW_UP: "Event follow-up",
  POST_APPLICATION: "Post-application message",
};

const MessagesSchema = z.object({ professional: z.string(), warm: z.string() });

export interface MessageFacts {
  senderName: string;
  senderHeadline: string | null;
  education: string[];
  recentExperience: string[];
  objective: string;
  contactName: string;
  contactTitle: string | null;
  company: string | null;
  sharedBackground: string | null;
  lastInteraction: string | null;
  purpose: string;
  platform: "LINKEDIN" | "EMAIL";
  language: string;
  context?: string;
  usesProfile: boolean;
}

/** Collect only verified, confirmed facts. CV-derived facts are included only with AI consent. */
export async function messageFacts(user: User, ws: Workspace, contactId: string, purpose: string, platform: "LINKEDIN" | "EMAIL", language: string, context?: string, forAi = true): Promise<MessageFacts> {
  const contact = await db.contact.findFirstOrThrow({ where: { id: contactId, workspaceId: ws.id }, include: { company: true, interactions: { orderBy: { occurredAt: "desc" }, take: 1 } } });
  const profile = await db.userProfile.findUnique({ where: { userId: user.id }, include: { education: { orderBy: { position: "asc" } }, experience: { orderBy: { position: "asc" } } } });
  const usesProfile = Boolean(profile?.confirmedAt) && (!forAi || Boolean(user.aiConsentAt));
  const education = usesProfile ? profile!.education.map((e) => [e.degree, e.field, e.institution].filter(Boolean).join(", ")) : [];
  // Shared background only when the user confirmed the alumni link on the contact
  const shared = contact.alumniOf ? `Both studied at ${contact.alumniOf} (confirmed by the user)` : null;
  const last = contact.interactions[0];
  return {
    senderName: user.name,
    senderHeadline: usesProfile ? profile!.headline : null,
    education,
    recentExperience: usesProfile ? profile!.experience.slice(0, 2).map((e) => `${e.title ?? ""} at ${e.employer}`.trim()) : [],
    objective: ws.objective,
    contactName: contact.fullName,
    contactTitle: contact.title,
    company: contact.company?.name ?? null,
    sharedBackground: shared,
    lastInteraction: last ? `${last.type.toLowerCase()} on ${last.occurredAt.toISOString().slice(0, 10)}${last.summary ? `: ${last.summary.slice(0, 300)}` : ""}` : null,
    purpose,
    platform,
    language,
    context,
    usesProfile,
  };
}

const SYSTEM = `You write short, specific networking messages for a job seeker.
- Use ONLY the facts given. Never invent achievements, mutual connections, shared schools, events or prior conversations.
- Mention a shared background only if "sharedBackground" is provided.
- No flattery, no generic compliments ("I'm impressed by your amazing career"), no exclamation marks, no buzzwords.
- Be concrete about the ask. Respect the reader's time.
- LinkedIn connection requests must be under 300 characters. Other LinkedIn messages under 700 characters. Emails under 150 words, with a subject line on the first line as "Subject: ...".
- Write in the requested language. Return two versions: "professional" (concise, formal) and "warm" (conversational, still professional).`;

export async function generateMessages(args: { user: User; workspace: Workspace; contactId: string; purpose: string; platform: "LINKEDIN" | "EMAIL"; language: string; context?: string }) {
  const llm = getProviders().llm;
  const facts = await messageFacts(args.user, args.workspace, args.contactId, args.purpose, args.platform, args.language, args.context, Boolean(llm));
  if (llm) {
    try {
      const res = await llm.json({ system: SYSTEM, user: JSON.stringify({ ...facts, purpose: PURPOSE_LABEL[facts.purpose] }), schema: MessagesSchema, maxTokens: 3000 });
      await db.usageRecord.create({ data: { userId: args.user.id, workspaceId: args.workspace.id, kind: "LLM", provider: llm.name, credits: 2, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens } });
      const limit = args.purpose === "CONNECTION_REQUEST" ? 300 : 5000;
      return { generatedBy: "AI" as const, usesProfile: facts.usesProfile, professional: res.data.professional.slice(0, limit), warm: res.data.warm.slice(0, limit) };
    } catch (e) {
      if (!(e instanceof ProviderError)) throw e;
      console.warn("AI message generation failed; using template", e.message);
    }
  }
  return { generatedBy: "TEMPLATE" as const, usesProfile: facts.usesProfile, ...templateMessages(facts) };
}

/** Deterministic templates used when no AI provider is configured. Only verified facts are inserted. */
const lowerFirst = (s: string) => (/^I('|\s)/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

export function templateMessages(f: MessageFacts) {
  const fr = f.language === "fr";
  const first = f.contactName.split(" ")[0];
  const at = f.company ? (fr ? ` chez ${f.company}` : ` at ${f.company}`) : "";
  const role = f.contactTitle ? (fr ? `votre rôle de ${f.contactTitle}${at}` : `your work as ${f.contactTitle}${at}`) : fr ? `votre parcours${at}` : `your experience${at}`;
  const me = f.education[0] ? (fr ? `Je suis ${f.education[0]}` : `I'm studying ${f.education[0]}`) : f.senderHeadline ? (fr ? `Je suis ${f.senderHeadline}` : `I'm ${f.senderHeadline}`) : fr ? "Je prépare la prochaine étape de ma carrière" : "I'm preparing the next step in my career";
  const shared = f.sharedBackground ? (fr ? ` Nous avons tous les deux étudié à ${f.sharedBackground.replace(/^Both studied at | \(confirmed by the user\)$/g, "")}.` : ` We both studied at ${f.sharedBackground.replace(/^Both studied at | \(confirmed by the user\)$/g, "")}.`) : "";
  const goal = f.objective ? f.objective.split(/[.!?]/)[0].slice(0, 160) : "";
  const T = (en: string, frTxt: string) => (fr ? frTxt : en);
  const bodies: Record<string, [string, string]> = {
    CONNECTION_REQUEST: [
      T(`Hello ${first}, ${lowerFirst(me)} and I'm exploring roles${at}.${shared} I'd value connecting and learning about ${role}.`, `Bonjour ${first}, ${lowerFirst(me)} et je m'intéresse aux opportunités${at}.${shared} J'aimerais échanger sur ${role}.`),
      T(`Hi ${first}, I'm looking into opportunities${at} and your path stood out to me.${shared} Would you be open to connecting?`, `Bonjour ${first}, je m'intéresse aux opportunités${at} et votre parcours m'a interpellé.${shared} Seriez-vous d'accord pour que nous soyons en contact ?`),
    ],
    CALL_REQUEST: [
      T(`Hello ${first},\n\n${me}. ${goal ? `My goal: ${goal}. ` : ""}Would you have 15 minutes in the coming weeks to tell me about ${role}? I'd be grateful for your perspective.\n\nThank you,\n${f.senderName}`, `Bonjour ${first},\n\n${me}. ${goal ? `Mon objectif : ${goal}. ` : ""}Auriez-vous 15 minutes dans les semaines à venir pour me parler de ${role} ? Votre regard me serait précieux.\n\nMerci,\n${f.senderName}`),
      T(`Hi ${first},\n\nThanks for connecting.${shared} I'm exploring roles${at} and would love to hear how you found ${role}. Could we do a quick 15-minute call at a time that suits you?\n\nBest,\n${f.senderName}`, `Bonjour ${first},\n\nMerci pour la connexion.${shared} Je m'intéresse aux postes${at} et j'aimerais beaucoup avoir votre retour sur ${role}. Pourrions-nous échanger 15 minutes quand cela vous arrange ?\n\nBien à vous,\n${f.senderName}`),
    ],
    FOLLOW_UP: [
      T(`Hello ${first},\n\nI wanted to follow up on my previous message${f.lastInteraction ? ` (${f.lastInteraction.split(":")[0]})` : ""}. I understand you're busy. If a short call isn't possible, any advice on ${role} would be very helpful.\n\nThank you,\n${f.senderName}`, `Bonjour ${first},\n\nJe me permets de revenir vers vous suite à mon précédent message. Si un appel n'est pas possible, un conseil sur ${role} me serait très utile.\n\nMerci,\n${f.senderName}`),
      T(`Hi ${first}, just bringing this back to the top of your inbox. No pressure at all; I'd still really appreciate 15 minutes whenever works.\n\n${f.senderName}`, `Bonjour ${first}, je relance simplement mon message, sans aucune pression. 15 minutes quand cela vous convient me feraient très plaisir.\n\n${f.senderName}`),
    ],
    THANK_YOU: [
      T(`Hello ${first},\n\nThank you for taking the time to speak with me. Your insights on ${role} were very useful, and I'll follow your advice.\n\nBest regards,\n${f.senderName}`, `Bonjour ${first},\n\nMerci d'avoir pris le temps d'échanger avec moi. Vos conseils sur ${role} m'ont été très utiles.\n\nBien cordialement,\n${f.senderName}`),
      T(`Hi ${first}, thanks again for the chat. It really helped me understand ${role}. I'll keep you posted on how things go.\n\n${f.senderName}`, `Bonjour ${first}, merci encore pour notre échange, il m'a vraiment aidé. Je vous tiendrai au courant.\n\n${f.senderName}`),
    ],
    REFERRAL_REQUEST: [
      T(`Hello ${first},\n\nThank you again for your help so far. I'm applying${at} and wondered whether you would be comfortable referring me. I'm happy to send my CV and a short summary to make it easy.\n\nBest regards,\n${f.senderName}`, `Bonjour ${first},\n\nMerci encore pour votre aide. Je candidate${at} et me demandais si vous accepteriez de me recommander. Je peux vous envoyer mon CV et un court résumé.\n\nBien cordialement,\n${f.senderName}`),
      T(`Hi ${first}, I've decided to apply${at}. Would you be open to referring me? Completely understand if not, and thanks either way.\n\n${f.senderName}`, `Bonjour ${first}, j'ai décidé de candidater${at}. Accepteriez-vous de me recommander ? Je comprendrai tout à fait si ce n'est pas possible.\n\n${f.senderName}`),
    ],
  };
  const key = bodies[f.purpose] ? f.purpose : f.purpose === "INTRO_EMAIL" || f.purpose === "AFTER_CONNECTION" || f.purpose === "EVENT_FOLLOW_UP" ? "CALL_REQUEST" : f.purpose === "POST_APPLICATION" ? "FOLLOW_UP" : "CALL_REQUEST";
  let [professional, warm] = bodies[key];
  if (f.platform === "EMAIL" && !professional.startsWith("Subject")) {
    const subject = T(`Subject: ${PURPOSE_LABEL[f.purpose]}${at}`, `Objet : ${PURPOSE_LABEL[f.purpose]}${at}`);
    professional = `${subject}\n\n${professional}`;
    warm = `${subject}\n\n${warm}`;
  }
  if (f.purpose === "CONNECTION_REQUEST") {
    professional = professional.slice(0, 300);
    warm = warm.slice(0, 300);
  }
  return { professional, warm };
}
