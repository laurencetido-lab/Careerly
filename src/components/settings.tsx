"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Download, XCircle } from "lucide-react";
import { deleteAccount, savePreferences, setAiConsent } from "@/app/actions/settings";
import { formatDate } from "@/lib/utils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Field, Input, Select } from "./ui/input";

type U = { name: string; email: string; locale: string; networkingLanguage: string; timezone: string; currency: string; dateFormat: string; emailNotifications: boolean; aiConsentAt: string | null; plan: string };

export function SettingsView({ user, providers, credits, usage }: { user: U; providers: { search: string | null; extract: string; llm: string | null; researchReady: boolean }; credits: { allowance: number; used: number; reserved: number; available: number }; usage: { kind: string; provider: string; calls: number; credits: number; inputTokens: number; outputTokens: number }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [u, setU] = useState(user);
  const Status = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className="flex items-center gap-1.5 text-sm">{ok ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-muted-foreground" />} {label}</span>
  );
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>Preferences</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} /></Field>
            <Field label="Email"><Input value={u.email} disabled /></Field>
            <Field label="Interface language"><Select value={u.locale} onChange={(e) => setU({ ...u, locale: e.target.value })}><option value="en">English</option><option value="fr">Français</option></Select></Field>
            <Field label="Default networking language"><Select value={u.networkingLanguage} onChange={(e) => setU({ ...u, networkingLanguage: e.target.value })}><option value="en">English</option><option value="fr">French</option><option value="de">German</option><option value="es">Spanish</option><option value="it">Italian</option><option value="nl">Dutch</option><option value="pt">Portuguese</option></Select></Field>
            <Field label="Time zone"><Input value={u.timezone} onChange={(e) => setU({ ...u, timezone: e.target.value })} placeholder="Europe/Paris" /></Field>
            <Field label="Display currency"><Input value={u.currency} maxLength={3} onChange={(e) => setU({ ...u, currency: e.target.value.toUpperCase() })} /></Field>
            <Field label="Date format"><Select value={u.dateFormat} onChange={(e) => setU({ ...u, dateFormat: e.target.value })}><option value="dd/MM/yyyy">31/12/2027</option><option value="MM/dd/yyyy">12/31/2027</option><option value="yyyy-MM-dd">2027-12-31</option></Select></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={u.emailNotifications} onChange={(e) => setU({ ...u, emailNotifications: e.target.checked })} /> Email me important notifications (email delivery is not enabled in this version; in-app notifications always work)</label>
          <Button disabled={pending} onClick={() => start(async () => { const r = await savePreferences({ name: u.name, locale: u.locale, networkingLanguage: u.networkingLanguage, timezone: u.timezone, currency: u.currency, dateFormat: u.dateFormat, emailNotifications: u.emailNotifications }); if (!r.ok) toast.error(r.error); else { toast.success("Saved"); router.refresh(); } })}>Save preferences</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI processing of your personal data</CardTitle>
          <CardDescription>When allowed, your CV text and confirmed profile are sent to Anthropic (Claude) to extract your profile and personalise messages. Public web research never includes your CV, private notes or private salary insights.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {u.aiConsentAt ? <Badge variant="success">Allowed since {formatDate(u.aiConsentAt)}</Badge> : <Badge variant="outline">Not allowed</Badge>}
          <Button variant={u.aiConsentAt ? "outline" : "default"} disabled={pending} onClick={() => start(async () => { const r = await setAiConsent(!u.aiConsentAt); if (!r.ok) return void toast.error(r.error); setU({ ...u, aiConsentAt: u.aiConsentAt ? null : new Date().toISOString() }); router.refresh(); })}>
            {u.aiConsentAt ? "Withdraw consent" : "Allow AI processing"}
          </Button>
        </CardContent>
      </Card>

      <Card id="providers">
        <CardHeader>
          <CardTitle>Research providers</CardTitle>
          <CardDescription>Configured by the administrator with server environment variables. Keys are never sent to the browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Status ok={Boolean(providers.search)} label={`Web search: ${providers.search ?? "not configured"}`} />
            <Status ok label={`Page reading: ${providers.extract}`} />
            <Status ok={Boolean(providers.llm)} label={`AI extraction: ${providers.llm ?? "not configured"}`} />
          </div>
          {!providers.researchReady ? (
            <div className="rounded-md bg-muted/60 p-3 text-xs">
              <p className="mb-1 font-medium">To enable live research, set on the web and worker servers:</p>
              <pre className="overflow-x-auto font-mono">TAVILY_API_KEY=…        # or BRAVE_SEARCH_API_KEY=…{"\n"}ANTHROPIC_API_KEY=…{"\n"}FIRECRAWL_API_KEY=…     # optional; otherwise the built-in robots.txt-aware fetcher is used</pre>
              <p className="mt-1 text-muted-foreground">Until then, use manual research: open any row and choose “Add value with source”.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Usage this month</CardTitle><CardDescription>Plan: {user.plan.toLowerCase()} · {credits.allowance} research credits per month</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={credits.used} aria-valuemax={credits.allowance}><div className="h-full rounded-full" style={{ width: `${Math.min(100, (credits.used / Math.max(1, credits.allowance)) * 100)}%`, background: "var(--series-1)" }} /></div>
          <p className="text-sm text-muted-foreground">{credits.used} used · {credits.reserved} reserved by running jobs · {credits.available} available</p>
          {usage.length ? (
            <table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Type</th><th>Provider</th><th>Calls</th><th>Credits</th><th>Tokens (in/out)</th></tr></thead>
              <tbody>{usage.map((x) => <tr key={x.kind + x.provider} className="border-t"><td className="py-1.5">{x.kind.toLowerCase()}</td><td>{x.provider}</td><td>{x.calls}</td><td>{x.credits}</td><td>{x.inputTokens} / {x.outputTokens}</td></tr>)}</tbody></table>
          ) : null}
          <p className="text-xs text-muted-foreground">1 search = 1 credit · 1 page read = 1 credit · 1 AI call = 2 credits. Cached results are free.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Your data</CardTitle><CardDescription>Download everything Careerly stores about you, or delete your account.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><a href="/api/account/export"><Download /> Export all my data (JSON)</a></Button>
          <Button variant="destructive" onClick={async () => {
            const pw = prompt("This permanently deletes your account, all workspaces and files. Enter your password to confirm.");
            if (!pw) return;
            const r = await deleteAccount(pw);
            if (r && !r.ok) toast.error(r.error);
          }}>Delete account</Button>
        </CardContent>
      </Card>
    </div>
  );
}
