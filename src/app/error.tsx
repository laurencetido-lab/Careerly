"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-lg font-semibold">Something went wrong</p>
      <p className="text-sm text-muted-foreground">The error was logged. Try again, and contact support if it keeps happening.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
