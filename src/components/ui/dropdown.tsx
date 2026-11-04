"use client";
import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ className, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content sideOffset={4} align="start" className={cn("z-50 min-w-[180px] rounded-lg border bg-card p-1 shadow-lg animate-in", className)} {...props} />
    </M.Portal>
  );
}

export function MenuItem({ className, danger, ...props }: React.ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return <M.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted [&_svg]:size-4", danger && "text-destructive", className)} {...props} />;
}

export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-border" />;
export const MenuLabel = ({ children }: { children: React.ReactNode }) => <M.Label className="px-2 py-1 text-xs text-muted-foreground">{children}</M.Label>;
