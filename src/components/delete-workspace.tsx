"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteWorkspace } from "@/app/actions/workspace";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

export function DeleteWorkspace({ workspaceId, name }: { workspaceId: string; name: string }) {
  const router = useRouter();
  return (
    <Card className="border-destructive/30">
      <CardHeader><CardTitle>Delete workspace</CardTitle><CardDescription>Permanently deletes all tables, research, contacts and applications in “{name}”.</CardDescription></CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={async () => {
          if (prompt(`Type the workspace name to confirm: ${name}`) !== name) return;
          const r = await deleteWorkspace(workspaceId);
          if (!r.ok) return void toast.error(r.error);
          router.push("/app/workspaces");
          router.refresh();
        }}>Delete workspace</Button>
      </CardContent>
    </Card>
  );
}
