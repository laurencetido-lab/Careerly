import { db } from "@/server/db";
import { requireUserPage } from "@/server/auth";
import { providerStatus } from "@/server/providers";
import { creditSummary, monthStart } from "@/server/credits";
import { PageHeader } from "@/components/page-header";
import { SettingsView } from "@/components/settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUserPage();
  const usage = await db.usageRecord.groupBy({ by: ["kind", "provider"], where: { userId: user.id, createdAt: { gte: monthStart() } }, _sum: { credits: true, inputTokens: true, outputTokens: true }, _count: true });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" />
      <SettingsView
        user={{ name: user.name, email: user.email, locale: user.locale, networkingLanguage: user.networkingLanguage, timezone: user.timezone, currency: user.currency, dateFormat: user.dateFormat, emailNotifications: user.emailNotifications, aiConsentAt: user.aiConsentAt?.toISOString() ?? null, plan: user.plan }}
        providers={providerStatus()}
        credits={await creditSummary(user.id)}
        usage={usage.map((u) => ({ kind: u.kind, provider: u.provider, calls: u._count, credits: u._sum.credits ?? 0, inputTokens: u._sum.inputTokens ?? 0, outputTokens: u._sum.outputTokens ?? 0 }))}
      />
    </div>
  );
}
