import Link from "next/link";
import { Bell } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Logo } from "./logo";
import { NavLinks, MobileNav, ThemeToggle, WorkspaceSwitcher } from "./shell-client";
import { t } from "@/lib/i18n";
import { CommandPalette } from "./command-palette";

export function Shell({
  user,
  workspace,
  workspaces,
  unread,
  children,
}: {
  user: { name: string; email: string; locale: string };
  workspace?: { id: string; name: string } | null;
  workspaces: { id: string; name: string }[];
  unread: number;
  children: React.ReactNode;
}) {
  const d = t(user.locale);
  const base = workspace ? `/app/w/${workspace.id}` : null;
  const items = base
    ? [
        { href: base, label: d.home, icon: "home" },
        { href: `${base}/research`, label: d.research, icon: "research" },
        { href: `${base}/data`, label: d.companies, icon: "companies" },
        { href: `${base}/opportunities`, label: d.opportunities, icon: "opportunities" },
        { href: `${base}/networking`, label: d.networking, icon: "networking" },
        { href: `${base}/applications`, label: d.applications, icon: "applications" },
        { href: `${base}/agenda`, label: d.agenda, icon: "agenda" },
        { href: `${base}/compensation`, label: d.compensation, icon: "compensation" },
        { href: `${base}/ranking`, label: d.analytics, icon: "analytics" },
        { href: `${base}/monitoring`, label: d.monitoring, icon: "monitoring" },
        { href: `${base}/documents`, label: d.documents, icon: "documents" },
        { href: `${base}/assistant`, label: d.assistant, icon: "assistant" },
      ]
    : [];
  const footer = [
    { href: "/app/workspaces", label: d.workspaces, icon: "workspaces" },
    { href: "/app/profile", label: d.profile, icon: "profile" },
    { href: "/app/settings", label: d.settings, icon: "settings" },
  ];
  const sidebar = (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between px-1.5 pt-1">
        <Link href="/app" aria-label="Careerly home">
          <Logo />
        </Link>
        <Link href="/app/notifications" className="relative rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label={`${d.notifications}${unread ? ` (${unread} unread)` : ""}`}>
          <Bell className="size-4" />
          {unread > 0 ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground">{unread > 99 ? "99+" : unread}</span> : null}
        </Link>
      </div>
      <WorkspaceSwitcher current={workspace ?? null} workspaces={workspaces} newLabel={d.newWorkspace} />
      {workspace ? <CommandPalette workspaceId={workspace.id} pages={items.map(({ label, href }) => ({ label, href }))} /> : null}
      <NavLinks items={items} />
      <div className="mt-auto space-y-1">
        <NavLinks items={footer} />
        <div className="flex items-center justify-between gap-2 border-t px-1.5 pt-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex items-center">
            <ThemeToggle />
            <form action={logout}>
              <button className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted" type="submit">{d.signOut}</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r bg-muted/30 lg:block">{sidebar}</aside>
      <MobileNav title={workspace?.name ?? "Careerly"}>{sidebar}</MobileNav>
      <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
    </div>
  );
}
