import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FileSpreadsheet, Radar, Search, Users } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default async function Landing() {
  if (await getCurrentUser()) redirect("/app");
  const features = [
    { icon: Search, title: "Research with real sources", body: "Every value links to the page it came from, with the exact excerpt, a date and a confidence level." },
    { icon: FileSpreadsheet, title: "Bring any spreadsheet", body: "Upload Excel or CSV with any columns. Careerly maps them and enriches what is missing." },
    { icon: Users, title: "Find the right people", body: "Discover public professionals at target employers and draft messages grounded in your real profile." },
    { icon: Radar, title: "Stay up to date", body: "Weekly monitoring detects new openings, deadlines and changes, and never overwrites what you confirmed." },
  ];
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <div className="flex gap-2">
          <Button variant="ghost" asChild><Link href="/login">Sign in</Link></Button>
          <Button asChild><Link href="/signup">Get started</Link></Button>
        </div>
      </header>
      <section className="mx-auto max-w-4xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
        <p className="mb-4 inline-flex rounded-full border px-3 py-1 text-xs text-muted-foreground">AI career intelligence for students and professionals</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Discover. Connect. Grow.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          Tell Careerly the career you want. It researches employers and opportunities across the web, finds the people worth talking to, and tells you what to do next.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button size="lg" asChild><Link href="/signup">Start your search <ArrowRight /></Link></Button>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-24 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border bg-card p-5">
            <f.icon className="size-5 text-primary" />
            <p className="mt-3 font-medium">{f.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:underline">Privacy</Link> · © {new Date().getFullYear()} Careerly
      </footer>
    </div>
  );
}
