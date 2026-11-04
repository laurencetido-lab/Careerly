"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as D from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { quickSearch } from "@/app/actions/search";
import { Badge } from "./ui/badge";

type Hit = { kind: string; title: string; detail: string; href: string };

/** Ctrl/⌘+K quick search and navigation. */
export function CommandPalette({ workspaceId, pages }: { workspaceId: string; pages: { label: string; href: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [i, setI] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const pageHits = pages.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())).map((p) => ({ kind: "Page", title: p.label, detail: "", href: p.href }));
      if (q.trim().length < 2) return void (n === seq.current && (setHits(pageHits), setI(0)));
      const r = await quickSearch(workspaceId, q);
      if (n === seq.current) { setHits([...(r.ok ? r.data : []), ...pageHits]); setI(0); }
    }, 150);
    return () => clearTimeout(t);
  }, [q, workspaceId, pages]);
  const go = (h: Hit) => { setOpen(false); setQ(""); router.push(h.href); };
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex w-full items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted" aria-label="Quick search">
        <Search className="size-4" /> <span className="flex-1">Search…</span><kbd className="rounded border px-1 text-[10px]">Ctrl K</kbd>
      </button>
      <D.Root open={open} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <D.Content className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-card shadow-2xl">
            <D.Title className="sr-only">Quick search</D.Title>
            <D.Description className="sr-only">Search employers, contacts, applications and pages</D.Description>
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 text-muted-foreground" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Employers, contacts, applications, pages…" className="h-12 flex-1 bg-transparent text-sm outline-none" aria-label="Search"
                onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(hits.length - 1, x + 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); } if (e.key === "Enter" && hits[i]) go(hits[i]); }} />
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-1" role="listbox">
              {hits.length === 0 ? <li className="p-4 text-center text-sm text-muted-foreground">{q.length < 2 ? "Type at least 2 letters" : "No results"}</li> : hits.map((h, k) => (
                <li key={h.href + h.title + k} role="option" aria-selected={k === i}>
                  <button onMouseEnter={() => setI(k)} onClick={() => go(h)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${k === i ? "bg-muted" : ""}`}>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{h.title}</span>{h.detail ? <span className="block truncate text-xs text-muted-foreground">{h.detail}</span> : null}</span>
                    <Badge variant="outline">{h.kind}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}
