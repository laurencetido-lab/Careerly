"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import * as D from "@radix-ui/react-dialog";
import {
  BarChart3, Bot, Briefcase, Building2, CalendarDays, Check, ChevronsUpDown, FileText, FolderKanban, Home, Menu as MenuIcon, Moon, Plus, Radar, Search, Settings, Sun, User, Users, Wallet, Layers,
} from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "./ui/dropdown";
import { cn } from "@/lib/utils";

const ICONS = {
  home: Home, research: Search, companies: Building2, opportunities: Briefcase, networking: Users, applications: FolderKanban,
  compensation: Wallet, agenda: CalendarDays, analytics: BarChart3, monitoring: Radar, documents: FileText, assistant: Bot, workspaces: Layers, profile: User, settings: Settings,
} as const;

export function NavLinks({ items }: { items: { href: string; label: string; icon: string }[] }) {
  const path = usePathname();
  return (
    <nav className="space-y-0.5">
      {items.map((it) => {
        const Icon = ICONS[it.icon as keyof typeof ICONS] ?? Home;
        const active = path === it.href || (it.href.split("/").length > 4 && path.startsWith(it.href));
        return (
          <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", active && "bg-muted font-medium text-foreground")}>
            <Icon className="size-4" />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function WorkspaceSwitcher({ current, workspaces, newLabel }: { current: { id: string; name: string } | null; workspaces: { id: string; name: string }[]; newLabel: string }) {
  return (
    <Menu>
      <MenuTrigger className="flex w-full items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-2 text-left text-sm shadow-sm hover:bg-muted" aria-label="Switch workspace">
        <span className="truncate font-medium">{current?.name ?? "Choose a workspace"}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuContent className="w-[224px]">
        {workspaces.map((w) => (
          <MenuItem key={w.id} asChild>
            <Link href={`/app/w/${w.id}`}>
              <Check className={cn("size-4", current?.id === w.id ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{w.name}</span>
            </Link>
          </MenuItem>
        ))}
        {workspaces.length ? <MenuSeparator /> : null}
        <MenuItem asChild>
          <Link href="/app/onboarding">
            <Plus /> {newLabel}
          </Link>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  return (
    <button
      type="button"
      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("careerly-theme", next ? "dark" : "light");
        } catch {}
      }}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function MobileNav({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur lg:hidden">
      <D.Root open={open} onOpenChange={setOpen}>
        <D.Trigger className="rounded-md p-2 hover:bg-muted" aria-label="Open navigation">
          <MenuIcon className="size-5" />
        </D.Trigger>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <D.Content className="fixed inset-y-0 left-0 z-50 w-[272px] border-r bg-background animate-in">
            <D.Title className="sr-only">Navigation</D.Title>
            <D.Description className="sr-only">Main navigation</D.Description>
            {children}
          </D.Content>
        </D.Portal>
      </D.Root>
      <span className="truncate text-sm font-medium">{title}</span>
    </div>
  );
}
