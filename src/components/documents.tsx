"use client";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Trash2, Upload } from "lucide-react";
import { deleteDocument, uploadDocument } from "@/app/actions/documents";
import { formatDate } from "@/lib/utils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, EmptyState } from "./ui/card";
import { Input, Select } from "./ui/input";

const kb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

export function DocumentsView({ workspaceId, docs, sheets }: { workspaceId: string; docs: { id: string; fileId: string; title: string; kind: string; version: string | null; size: number; name: string; createdAt: string }[]; sheets: { id: string; name: string; size: number; createdAt: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="pt-4">
          <form ref={form} className="grid gap-2 sm:grid-cols-[1fr_160px_120px_auto]" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { const r = await uploadDocument(workspaceId, fd); if (!r.ok) return void toast.error(r.error); toast.success("Uploaded"); form.current?.reset(); router.refresh(); }); }}>
            <Input name="file" type="file" accept=".pdf,.docx,.txt" required aria-label="File" />
            <Select name="kind" aria-label="Kind"><option value="CV">CV version</option><option value="COVER_LETTER">Cover letter</option><option value="OTHER">Other</option></Select>
            <Input name="version" placeholder="Version" aria-label="Version" />
            <Button type="submit" disabled={pending}><Upload /> Upload</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">PDF, DOCX or TXT, up to 10 MB.</p>
        </CardContent>
      </Card>
      {docs.length === 0 ? <EmptyState icon={<FileText />} title="No documents yet">Keep each CV version and cover letter here so applications can reference them.</EmptyState> : (
        <Card className="divide-y">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.title} {d.version ? <span className="text-muted-foreground">· {d.version}</span> : null}</p>
                <p className="text-xs text-muted-foreground">{d.name} · {kb(d.size)} · {formatDate(d.createdAt)}</p>
              </div>
              <Badge variant="outline">{d.kind === "COVER_LETTER" ? "Cover letter" : d.kind === "CV" ? "CV" : "Other"}</Badge>
              <Button size="icon" variant="ghost" asChild><a href={`/api/files/${d.fileId}`} aria-label="Download"><Download /></a></Button>
              <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => start(async () => { if (!confirm("Delete this document?")) return; await deleteDocument(workspaceId, d.id); router.refresh(); })}><Trash2 /></Button>
            </div>
          ))}
        </Card>
      )}
      {sheets.length ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Imported spreadsheets</h2>
          <Card className="divide-y">
            {sheets.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <FileSpreadsheet className="size-4 text-muted-foreground" />
                <p className="min-w-0 flex-1 truncate text-sm">{s.name} <span className="text-xs text-muted-foreground">· {kb(s.size)} · {formatDate(s.createdAt)}</span></p>
                <Button size="icon" variant="ghost" asChild><a href={`/api/files/${s.id}`} aria-label="Download original"><Download /></a></Button>
              </div>
            ))}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
