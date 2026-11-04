import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata = { title: "Privacy notice" };

export default function Privacy() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-sm leading-6 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_p]:mt-2 [&_li]:mt-1">
      <Link href="/"><Logo /></Link>
      <h1 className="mt-8 text-2xl font-semibold">Privacy notice</h1>
      <p className="text-muted-foreground">This notice explains what Careerly stores and why. It is a product draft and should be reviewed by counsel before commercial launch.</p>
      <h2>What we store</h2>
      <ul className="list-disc pl-5">
        <li>Your account details (name, email, a salted password hash) and preferences.</li>
        <li>Content you add: workspaces, spreadsheets, CVs, notes, applications.</li>
        <li>Research results: public facts about employers and the public sources they come from.</li>
        <li>Minimal public professional details of contacts you discover or add (name, job title, employer, public profile link, source). Sensitive attributes are never inferred.</li>
      </ul>
      <h2>Third-party processing</h2>
      <p>When research providers are configured, search queries are sent to a web search provider (Tavily or Brave), public pages may be read through an extraction service (Firecrawl) or directly, and source excerpts are sent to Anthropic (Claude) for structured extraction. Your CV content is only sent to the AI provider if you enable AI processing in Settings. Private notes and private salary insights are never used in web searches.</p>
      <h2>Your rights</h2>
      <p>You can export all your data as JSON, delete your account and everything in it, withdraw AI consent and switch off monitoring and notifications at any time in Settings.</p>
      <h2>Isolation</h2>
      <p>Every workspace is private to its members. Data is never shared across accounts.</p>
    </div>
  );
}
