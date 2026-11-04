import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap", {
  variants: {
    variant: {
      default: "border-transparent bg-secondary text-secondary-foreground",
      primary: "border-transparent bg-accent text-accent-foreground",
      success: "border-transparent bg-success/12 text-success",
      warning: "border-transparent bg-warning/15 text-warning",
      danger: "border-transparent bg-destructive/12 text-destructive",
      outline: "text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const CONF: Record<string, { label: string; variant: VariantProps<typeof badgeVariants>["variant"]; hint: string }> = {
  VERIFIED: { label: "Verified", variant: "success", hint: "Stated by an official company or careers source" },
  REPORTED: { label: "Reported", variant: "primary", hint: "Reported by a third-party public source" },
  ESTIMATED: { label: "Estimated", variant: "warning", hint: "Presented as an estimate by the source" },
  CONFLICTING: { label: "Conflicting", variant: "danger", hint: "Sources disagree; review the evidence" },
  UNKNOWN: { label: "Unknown", variant: "outline", hint: "No supporting public evidence found" },
};

export function ConfidenceBadge({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return null;
  const c = CONF[value] ?? CONF.UNKNOWN;
  return (
    <Badge variant={c.variant} className={className} title={c.hint}>
      {c.label}
    </Badge>
  );
}
