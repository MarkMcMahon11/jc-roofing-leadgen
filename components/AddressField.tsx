"use client";
import { useEffect, useId, useRef, useState } from "react";

export type Place = { placeId: string; address: string; postcode: string; lat: number; lng: number; partial?: boolean };
type Sug = { placeId: string; main: string; secondary: string };

const field = "w-full rounded-xl border-[1.5px] border-sand bg-white px-3.5 py-3 text-base focus:border-ink";

export default function AddressField({
  selected,
  onSelect,
  onClear,
  onManual,
}: {
  selected: Place | null;
  onSelect: (p: Place) => void;
  onClear: () => void;
  onManual: () => void;
}) {
  const [q, setQ] = useState("");
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [credit, setCredit] = useState("Powered by Google");
  const [base, setBase] = useState<Place | null>(null); // street-level pick still needing house number
  const [houseNo, setHouseNo] = useState("");
  const [pc, setPc] = useState("");
  const token = useRef("");
  const listId = useId();
  const active = !selected && q.trim().length >= 3;
  const shown = active ? sugs : [];

  useEffect(() => {
    token.current = crypto.randomUUID(); // one billing session per address search
  }, []);

  useEffect(() => {
    if (selected || q.trim().length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: q, sessionToken: token.current }),
          signal: ctrl.signal,
        });
        const j = await r.json();
        setSugs(j.suggestions ?? []);
        if (j.attribution) setCredit(j.attribution);
        setNote(!r.ok ? "Address search is unavailable right now. Please enter your address manually." : (j.suggestions ?? []).length ? "" : "No matches yet. Keep typing, or enter it manually.");
        setOpen(true);
        setHi(-1);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setNote("Address search is unavailable right now. Please enter your address manually.");
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, selected]);

  async function choose(s: Sug) {
    setOpen(false);
    setLoading(true);
    try {
      const r = await fetch(`/api/places/details?id=${encodeURIComponent(s.placeId)}&token=${token.current}`);
      if (!r.ok) throw new Error();
      const p: Place = await r.json();
      if (p.partial) {
        setBase(p);
        setPc(p.postcode);
        setHouseNo("");
        token.current = crypto.randomUUID();
        return;
      }
      if (!p.postcode) {
        setNote("That address has no postcode. Please pick a more specific one, or enter it manually.");
        return;
      }
      onSelect(p);
      token.current = crypto.randomUUID(); // session ends at selection
    } catch {
      setNote("Couldn't load that address. Please try another, or enter it manually.");
    } finally {
      setLoading(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || !shown.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % shown.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h <= 0 ? shown.length - 1 : h - 1)); }
    else if (e.key === "Enter" && hi >= 0) { e.preventDefault(); choose(shown[hi]); }
    else if (e.key === "Escape") setOpen(false);
  }

  if (selected)
    return (
      <div className="rounded-xl border-[1.5px] border-green-700 bg-green-50 px-3.5 py-3">
        <p className="text-[13px] font-semibold text-green-800">✓ Address confirmed</p>
        <p className="mt-0.5 text-base font-semibold leading-snug">{selected.address.replace(/, (UK|United Kingdom)$/, "")}</p>
        <button type="button" className="mt-1 text-[14px] text-mute underline" onClick={() => { onClear(); setBase(null); setQ(""); }}>Change address</button>
      </div>
    );

  if (base) {
    const ok = houseNo.trim().length > 0 && /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(pc.trim());
    return (
      <div className="space-y-2.5 rounded-xl border-[1.5px] border-sand bg-white p-3.5">
        <p className="text-base font-semibold leading-snug">{base.address}</p>
        <label className="block text-[13px] font-semibold">House number, name or flat
          <input className={`${field} mt-1`} placeholder="e.g. 12 or Flat 2/1" autoComplete="off" value={houseNo} onChange={(e) => setHouseNo(e.target.value)} />
        </label>
        <label className="block text-[13px] font-semibold">Postcode
          <input className={`${field} mt-1 uppercase`} placeholder="e.g. DG1 3QX" autoComplete="postal-code" value={pc} onChange={(e) => setPc(e.target.value)} />
        </label>
        <button type="button" disabled={!ok} className="w-full rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
          onClick={() => onSelect({ ...base, partial: false, address: `${houseNo.trim()} ${base.address} ${pc.trim().toUpperCase()}`, postcode: pc.trim().toUpperCase() })}>
          Confirm address
        </button>
        <button type="button" className="text-[14px] text-mute underline" onClick={() => setBase(null)}>Back to search</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <label htmlFor={`${listId}-in`} className="sr-only">Property address</label>
      <input
        id={`${listId}-in`}
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={hi >= 0 ? `${listId}-${hi}` : undefined}
        autoComplete="off"
        className={field}
        placeholder="Start typing your address or postcode"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={onKey}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => shown.length && setOpen(true)}
      />
      {loading && <span className="absolute right-3.5 top-3.5 h-5 w-5 animate-spin rounded-full border-2 border-sand border-t-brand" aria-label="Searching" />}
      {open && shown.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border-[1.5px] border-sand bg-white shadow-lg">
          {shown.map((s, i) => (
            <li
              key={s.placeId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => { e.preventDefault(); choose(s); }}
              onMouseEnter={() => setHi(i)}
              className={`cursor-pointer border-b border-sand px-3.5 py-2.5 last:border-b-0 ${i === hi ? "bg-brand-tint" : ""}`}
            >
              <span className="block text-[15px] font-medium leading-snug">{s.main}</span>
              <span className="block text-[13px] leading-snug text-mute">{s.secondary}</span>
            </li>
          ))}
          <li className="bg-cream px-3.5 py-1 text-right text-[11px] text-mute" aria-hidden>{credit}</li>
        </ul>
      )}
      <p aria-live="polite" className="mt-1.5 min-h-4 text-[13px] text-mute">{active ? note : ""}</p>
      <button type="button" className="mt-0.5 text-[14px] text-mute underline" onClick={onManual}>I can&apos;t find my address</button>
    </div>
  );
}
