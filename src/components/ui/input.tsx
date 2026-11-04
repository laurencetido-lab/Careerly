import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground disabled:opacity-50", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground disabled:opacity-50", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn("flex h-9 w-full rounded-md border border-input bg-background px-2.5 py-1 text-sm shadow-sm disabled:opacity-50", className)} {...props} />
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium leading-none", className)} {...props} />;
}

/**
 * Form field. Wraps a single control in its <label> so it is always programmatically labelled.
 * Use `group` for fields containing several controls (rendered as a fieldset with a legend).
 */
export function Field({ label, hint, children, htmlFor, group }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string; group?: boolean }) {
  if (group) {
    return (
      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-[13px] font-medium leading-none">{label}</legend>
        {children}
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </fieldset>
    );
  }
  if (htmlFor) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={htmlFor}>{label}</Label>
        {children}
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="block text-[13px] font-medium leading-none">{label}</span>
        {children}
      </label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
