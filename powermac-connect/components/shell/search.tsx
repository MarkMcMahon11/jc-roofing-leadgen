"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Building2, ClipboardList, FileSignature, Home, Search, UserRound } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { cx } from "@/components/ui/primitives";
import { globalSearch, type SearchHit } from "./actions";

const KIND: Record<string, { label: string; icon: typeof Search }> = {
  job: { label: "Job", icon: ClipboardList },
  property: { label: "Property", icon: Home },
  client: { label: "Client", icon: Building2 },
  contract: { label: "Contract", icon: FileSignature },
  person: { label: "Person", icon: UserRound },
};

export function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (compact) return; // the full-size instance owns the keyboard shortcut
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const id = setTimeout(() => start(async () => { setHits(await globalSearch(q)); setActive(0); }), 200);
    return () => clearTimeout(id);
  }, [q]);

  const shown = q.trim().length < 2 ? [] : hits;
  const go = (h: SearchHit) => { setOpen(false); setQ(""); router.push(h.link); };

  return (
    <>
      {compact ? (
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-muted hover:bg-raised hover:text-fg" aria-label="Search">
          <Search className="size-[18px]" />
        </button>
      ) : (
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[13px] text-subtle hover:border-line-strong hover:text-muted"
        aria-label="Search (Ctrl K)"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 truncate text-left">Search jobs, properties, clients…</span>
        <kbd className="hidden rounded border border-line-strong px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Search" size="lg">
        <div className="relative">
          <Search className={cx("absolute top-1/2 left-3 size-4 -translate-y-1/2", pending ? "animate-pulse text-accent-hi" : "text-subtle")} aria-hidden />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter" && shown[active]) go(shown[active]);
            }}
            placeholder="Job reference, address, postcode, client, contract or person"
            className="h-11 w-full rounded-xl border border-line-strong bg-sunken pr-3 pl-9 text-sm text-fg placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
            aria-label="Search everything"
            role="combobox"
            aria-expanded={shown.length > 0}
            aria-controls="global-search-results"
          />
        </div>
        <ul id="global-search-results" role="listbox" className="mt-3 max-h-[50vh] overflow-y-auto">
          {q.trim().length >= 2 && !pending && shown.length === 0 && <li className="py-8 text-center text-sm text-muted">No matches you have access to.</li>}
          {shown.map((h, i) => {
            const K = KIND[h.kind] ?? KIND.job!;
            const Icon = K.icon;
            return (
              <li key={h.kind + h.id} role="option" aria-selected={i === active}>
                <button onMouseEnter={() => setActive(i)} onClick={() => go(h)} className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left", i === active ? "bg-accent-lo" : "hover:bg-raised")}>
                  <Icon className="size-4 shrink-0 text-accent-hi" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{h.title}</span>
                    {h.subtitle && <span className="block truncate text-xs text-muted">{h.subtitle}</span>}
                  </span>
                  <span className="text-[11px] text-subtle">{K.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}
