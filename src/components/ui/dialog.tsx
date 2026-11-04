"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, title, description, wide, ...props }: React.ComponentProps<typeof D.Content> & { title: string; description?: string; wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-card p-5 shadow-xl animate-in",
          wide ? "max-w-3xl" : "max-w-lg",
          className,
        )}
        {...props}
      >
        <div className="mb-4 pr-8">
          <D.Title className="text-base font-semibold">{title}</D.Title>
          {description ? <D.Description className="mt-1 text-sm text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        </div>
        {children}
        <D.Close className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

/** Right-hand side panel built on the dialog primitive. */
export function SheetContent({ className, children, title, description, ...props }: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-black/30" />
      <D.Content className={cn("fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l bg-card shadow-2xl animate-in", className)} {...props}>
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <D.Title className="truncate text-base font-semibold">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-sm text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
