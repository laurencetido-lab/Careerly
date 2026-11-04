import { cn } from "@/lib/utils";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect width="24" height="24" rx="6" className="fill-primary" />
        <path d="M7 15.5 11 11l2.5 2.5L17 9" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="17" cy="9" r="1.6" fill="white" />
      </svg>
      {compact ? null : <span>Careerly</span>}
    </span>
  );
}
