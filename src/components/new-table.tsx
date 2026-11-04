"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createDataset } from "@/app/actions/data";
import { Button } from "./ui/button";

export function NewTableButton({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  return (
    <Button variant="outline" onClick={async () => {
      const name = prompt("Name of the new table");
      if (!name) return;
      const r = await createDataset(workspaceId, name);
      if (!r.ok) return void toast.error(r.error);
      router.push(`/app/w/${workspaceId}/data/${r.data.datasetId}`);
    }}><Plus /> New table</Button>
  );
}
