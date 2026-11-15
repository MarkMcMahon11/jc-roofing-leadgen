"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Home, Link2, Loader2, Search } from "lucide-react";
import { Badge, Button, CardBody, EmptyState, Mono, Notice, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionButton } from "../../crm/_components/action-button";
import { linkProperties, searchLinkableProperties, unlinkProperty, type LinkableProperty } from "../actions";

export type LinkedProperty = { id: string; reference: string; address: string; postcode: string; type: string; status: string; added: string };

const statusTone: Record<string, "ok" | "warn" | "info" | "neutral"> = { occupied: "ok", void: "warn", under_works: "info", inactive: "neutral" };

export function PropertyLinker({ contractId, linked, linkedTotal, unlinkedCount, canWrite }: { contractId: string; linked: LinkedProperty[]; linkedTotal: number; unlinkedCount: number; canWrite: boolean }) {
  return (
    <>
      {canWrite && <AddProperties contractId={contractId} unlinkedCount={unlinkedCount} />}
      {linked.length ? (
        <>
          <Table>
            <THead>
              <tr>
                <TH>Property</TH>
                <TH>Postcode</TH>
                <TH>Type</TH>
                <TH>Status</TH>
                <TH>Added</TH>
                {canWrite && <TH align="right">Actions</TH>}
              </tr>
            </THead>
            <tbody>
              {linked.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/properties/${p.id}`} className="font-medium hover:text-accent-hi">
                      {p.address}
                    </Link>
                    <div>
                      <Mono className="text-[11.5px]">{p.reference}</Mono>
                    </div>
                  </TD>
                  <TD className="text-[13px] whitespace-nowrap">{p.postcode}</TD>
                  <TD className="text-[13px] text-muted">{p.type}</TD>
                  <TD>
                    <Badge tone={statusTone[p.status] ?? "neutral"} dot>
                      {p.status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
                    </Badge>
                  </TD>
                  <TD className="text-[13px] whitespace-nowrap text-muted">{p.added}</TD>
                  {canWrite && (
                    <TD align="right">
                      <ActionButton link className="text-muted hover:text-[#ff8a87]" confirm={`Remove ${p.address} from this contract? The property itself is not deleted.`} action={() => unlinkProperty(contractId, p.id)}>
                        Remove
                      </ActionButton>
                    </TD>
                  )}
                </TR>
              ))}
            </tbody>
          </Table>
          {linkedTotal > linked.length && <p className="border-t border-line px-5 py-3 text-xs text-subtle">Showing {linked.length} of {linkedTotal} linked properties.</p>}
        </>
      ) : (
        <EmptyState icon={<Home className="size-8" />} title="No properties on this contract yet">
          Link the client&apos;s properties this contract covers so jobs, SLAs and reporting line up.
        </EmptyState>
      )}
    </>
  );
}

function AddProperties({ contractId, unlinkedCount }: { contractId: string; unlinkedCount: number }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LinkableProperty[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [opened, setOpened] = useState(false);

  const run = (term: string) => {
    startSearch(async () => {
      const r = await searchLinkableProperties(contractId, term);
      setResults(r);
      setSelected((s) => new Set([...s].filter((id) => r.some((p) => p.id === id))));
    });
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const link = (ids: string[] | "all") => {
    setMessage(null);
    startSave(async () => {
      const r = await linkProperties(contractId, ids);
      setMessage({ ok: r.ok, text: r.message ?? (r.ok ? "Linked." : "Could not link.") });
      if (r.ok) {
        setSelected(new Set());
        run(q);
      }
    });
  };

  return (
    <CardBody className="border-b border-line">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className={`pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 ${searching ? "animate-pulse text-accent-hi" : "text-subtle"}`} aria-hidden />
          <input
            type="search"
            value={q}
            onFocus={() => {
              if (!opened) {
                setOpened(true);
                run(q);
              }
            }}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              setOpened(true);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => run(v), 250);
            }}
            placeholder="Find the client's properties by address, postcode or reference…"
            aria-label="Find properties to link"
            className="h-10 w-full rounded-[10px] border border-line-strong bg-sunken pr-3 pl-9 text-sm text-fg placeholder:text-subtle hover:border-[#3d4b41] focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
          />
        </div>
        {unlinkedCount > 0 && (
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => {
              if (window.confirm(`Link all ${unlinkedCount} of the client's properties that are not yet on this contract?`)) link("all");
            }}
          >
            <Link2 className="size-4" aria-hidden />
            Link all {unlinkedCount} unlinked
          </Button>
        )}
      </div>
      {message && (
        <div className="mt-3">
          <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice>
        </div>
      )}
      {opened && results !== null && (
        <div className="mt-3 rounded-xl border border-line bg-sunken/60">
          {results.length ? (
            <>
              <ul className="max-h-72 divide-y divide-line/70 overflow-y-auto">
                {results.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-[#5ee000]"
                      checked={selected.has(p.id)}
                      onChange={(e) =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(p.id);
                          else n.delete(p.id);
                          return n;
                        })
                      }
                      aria-label={`Select ${p.address}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">{p.address}</p>
                      <p className="text-xs text-subtle">
                        {p.postcode} · <span className="font-mono">{p.reference}</span>
                      </p>
                    </div>
                    <button type="button" disabled={saving} onClick={() => link([p.id])} className="shrink-0 text-xs font-medium text-accent-hi hover:underline disabled:opacity-50">
                      Link
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
                <span className="text-xs text-subtle">{results.length} shown{results.length === 25 ? " - refine the search for more" : ""}</span>
                <Button size="sm" variant="primary" disabled={!selected.size || saving} onClick={() => link([...selected])}>
                  {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  Link selected ({selected.size})
                </Button>
              </div>
            </>
          ) : (
            <p className="px-3 py-3 text-sm text-subtle">{q ? "No unlinked properties match." : "All of this client's properties are already on the contract."}</p>
          )}
        </div>
      )}
    </CardBody>
  );
}
