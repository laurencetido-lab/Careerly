import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-lg font-semibold">Not found</p>
      <p className="text-sm text-muted-foreground">This page does not exist, or you do not have access to it.</p>
      <Button asChild><Link href="/app">Back to Careerly</Link></Button>
    </div>
  );
}
