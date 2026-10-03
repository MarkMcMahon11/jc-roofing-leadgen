"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { Search } from "lucide-react";
import { Badge, Card, PageHeader, Plate } from "@/components/admin/ui";
import { addDays, fmtDay, gbp, today } from "@/lib/ops/format";
import { AREA_COORDS, DG_CENTRE, HQ, hash01 } from "@/lib/ops/geo";
import { vehicleStatus } from "@/lib/ops/labels";
import { crewName, projectPins, STAGES, vanReg, type Pin, type Stage } from "@/lib/ops/selectors";
import { useOps } from "@/lib/ops/store";
import type { FleetDB, Vehicle } from "@/lib/ops/types";

type VanKind = "on_job" | "on_road" | "yard" | "garage" | "off";
const VAN_COLOR: Record<VanKind, string> = { on_job: "#ea580c", on_road: "#16a34a", yard: "#ffb507", garage: "#b11017", off: "#8a877a" };
const VAN_TEXT: Record<VanKind, string> = { on_job: "#c2410c", on_road: "#15803d", yard: "#92400e", garage: "#b11017", off: "#5f5f57" };
const VAN_LABEL: Record<VanKind, string> = { on_job: "On a job", on_road: "On the road", yard: "At the yard", garage: "In the garage", off: "Off the road" };

const short = (name: string) => (name.length > 16 ? name.slice(0, 15) + "…" : name);
const surname = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return short(parts.length > 1 ? parts[parts.length - 1] : name);
};

/** Where to draw a van: at today's job site if it is on one, otherwise at the yard or its last known area. Sample until a tracker is connected. */
function vanPlace(db: FleetDB, v: Vehicle): { lat: number; lng: number; kind: VanKind; jobTitle?: string } {
  const jit = (k: string, s: number) => (hash01(v.id + k) - 0.5) * s;
  const t = today();
  const job = db.jobs.find((j) => j.status !== "cancelled" && j.status !== "done" && j.vanIds.includes(v.id) && j.date <= t && (j.endDate ?? j.date) >= t && typeof j.lat === "number" && typeof j.lng === "number");
  if (v.status === "off_road") return { lat: HQ.lat - 0.0012 + jit("a", 0.0008), lng: HQ.lng + jit("b", 0.001), kind: "off" };
  if (v.status === "in_garage") return { lat: HQ.lat + 0.004 + jit("a", 0.001), lng: HQ.lng - 0.008 + jit("b", 0.001), kind: "garage" };
  if (job && v.status === "in_use") return { lat: job.lat! + jit("a", 0.0012), lng: job.lng! + 0.0009 + jit("b", 0.0012), kind: "on_job", jobTitle: job.title };
  if (v.status === "at_yard") return { lat: HQ.lat + jit("a", 0.0012), lng: HQ.lng + jit("b", 0.0016), kind: "yard" };
  const [la, ln] = AREA_COORDS[v.tracker.area] ?? [HQ.lat, HQ.lng];
  return { lat: la + jit("a", 0.01), lng: ln + jit("b", 0.014), kind: "on_road" };
}

function ProjectMap() {
  const { db, biz } = useOps();
  const params = useSearchParams();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const libRef = useRef<typeof Leaflet | null>(null);
  const markers = useRef(new Map<string, Leaflet.Marker>());
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(params.get("van") ? `v:${params.get("van")}` : params.get("pin") ? `p:${params.get("pin")}` : null);
  const [showProjects, setShowProjects] = useState(true);
  const [showVans, setShowVans] = useState(!!params.get("van"));
  const [off, setOff] = useState<Set<Stage>>(new Set(["lost"]));
  const [tab, setTab] = useState<"projects" | "vans">(params.get("van") ? "vans" : "projects");
  const [q, setQ] = useState("");

  const pins = useMemo(() => projectPins(db, biz.leads, (id) => biz.settings.materials.find((m) => m.id === id)?.label), [db, biz]);
  const vans = useMemo(() => db.vehicles.map((v) => ({ v, p: vanPlace(db, v) })), [db]);
  const unlocated = biz.leads.filter((l) => l.score !== "not-a-fit" && (typeof l.lat !== "number" || typeof l.lng !== "number")).length;
  const visiblePins = pins.filter((p) => !off.has(p.stage));
  const count = (s: Stage) => pins.filter((p) => p.stage === s).length;

  // create the map once
  useEffect(() => {
    let cancelled = false;
    const markerMap = markers.current;
    (async () => {
      const Lf = (await import("leaflet")).default;
      if (cancelled || !mapEl.current || mapRef.current) return;
      libRef.current = Lf;
      const map = Lf.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView(DG_CENTRE, 9);
      // OSM's tile servers reject requests without a Referer, so send the site origin (never the path)
      Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        referrerPolicy: "strict-origin-when-cross-origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      Lf.marker([HQ.lat, HQ.lng], { icon: Lf.divIcon({ className: "", html: '<div class="hq-pin" aria-hidden="true">JC</div>', iconSize: [30, 30], iconAnchor: [15, 15] }), zIndexOffset: 1000, keyboard: false })
        .addTo(map)
        .bindTooltip(HQ.label);
      mapRef.current = map;
      const ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(mapEl.current);
      map.on("unload", () => ro.disconnect());
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerMap.clear();
      fitted.current = false;
    };
  }, []);

  // draw / update markers
  useEffect(() => {
    const Lf = libRef.current;
    const map = mapRef.current;
    if (!Lf || !map || !ready) return;
    const want = new Map<string, { lat: number; lng: number; html: string; z: number }>();
    if (showProjects)
      for (const p of visiblePins) {
        const sel = selected === `p:${p.key}`;
        want.set(`p:${p.key}`, { lat: p.lat, lng: p.lng, z: sel ? 900 : 100, html: `<div class="map-pin${sel ? " is-sel" : ""}" style="--c:${STAGES[p.stage].color};--ct:${STAGES[p.stage].text}"><span class="dot"></span>${esc(surname(p.name))}</div>` });
      }
    if (showVans)
      for (const { v, p } of vans) {
        const sel = selected === `v:${v.id}`;
        want.set(`v:${v.id}`, { lat: p.lat, lng: p.lng, z: sel ? 950 : 500, html: `<div class="map-pin van${sel ? " is-sel" : ""}" style="--c:${VAN_COLOR[p.kind]};--ct:${VAN_TEXT[p.kind]}">${esc(v.reg)}</div>` });
      }
    for (const [key, w] of want) {
      let m = markers.current.get(key);
      const icon = Lf.divIcon({ className: "", html: w.html, iconSize: undefined, iconAnchor: [40, 14] });
      if (!m) {
        m = Lf.marker([w.lat, w.lng], { icon, keyboard: false }).addTo(map);
        m.on("click", () => setSelected(key));
        markers.current.set(key, m);
      } else {
        m.setLatLng([w.lat, w.lng]);
        m.setIcon(icon);
      }
      m.setZIndexOffset(w.z);
    }
    for (const [key, m] of markers.current) {
      if (want.has(key)) continue;
      m.remove();
      markers.current.delete(key);
    }
    if (!fitted.current && want.size && !selected) {
      fitted.current = true;
      const pts = [...want.values()].map((w) => [w.lat, w.lng] as [number, number]);
      if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 12 });
    }
  }, [ready, visiblePins, vans, showProjects, showVans, selected]);

  // fly to the selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selected) return;
    const pos = selected.startsWith("p:") ? pins.find((p) => `p:${p.key}` === selected) : vans.find(({ v }) => `v:${v.id}` === selected)?.p;
    if (pos) {
      const zoom = Math.max(map.getZoom(), 12);
      // on phones the info card sits over the bottom of the map: aim a little low so the pin stays in view above it
      const size = map.getSize();
      const lower = size.x < 640 ? size.y * 0.22 : 0;
      const centre = map.unproject(map.project([pos.lat, pos.lng], zoom).add([0, lower]), zoom);
      map.flyTo(centre, zoom, { duration: 0.8 });
      const r = mapEl.current?.getBoundingClientRect();
      if (r && (r.top < 56 || r.bottom > window.innerHeight)) mapEl.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the selection changes
  }, [selected, ready]);

  const selPin: Pin | undefined = selected?.startsWith("p:") ? pins.find((p) => `p:${p.key}` === selected) : undefined;
  const selVan = selected?.startsWith("v:") ? vans.find(({ v }) => `v:${v.id}` === selected) : undefined;
  const listPins = pins.filter((p) => !off.has(p.stage) && (!q || `${p.name} ${p.address} ${p.title}`.toLowerCase().includes(q.toLowerCase())));
  const listVans = vans.filter(({ v }) => !q || `${v.reg} ${v.make} ${v.model}`.toLowerCase().includes(q.toLowerCase()));
  const soon = pins.filter((p) => p.date && p.date >= today() && p.date <= addDays(today(), 7) && (p.stage === "scheduled" || p.stage === "inspection" || p.stage === "in_progress")).length;

  // choosing from the list scrolls the map into view if it is off screen (phones show the map above the list)
  const pick = (key: string) => {
    setSelected(key);
    const r = mapEl.current?.getBoundingClientRect();
    if (r && (r.top < 56 || r.bottom > window.innerHeight)) mapEl.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const toggleStage = (s: Stage) => setOff((cur) => { const n = new Set(cur); if (n.has(s)) n.delete(s); else n.add(s); return n; });

  return (
    <div>
      <PageHeader
        title="Project map"
        sub={
          <span className="flex flex-wrap items-center gap-2">
            {visiblePins.length} of {pins.length} customer project{pins.length === 1 ? "" : "s"} shown · {soon} happening in the next 7 days
            {unlocated > 0 && <Badge tone="amber">{unlocated} enquir{unlocated === 1 ? "y" : "ies"} with no location</Badge>}
          </span>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Map layers">
        <button type="button" aria-pressed={showProjects} onClick={() => setShowProjects(!showProjects)} className={`min-h-10 rounded-full px-4 py-1.5 text-sm font-semibold ${showProjects ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-sand"}`}>Projects</button>
        <button type="button" aria-pressed={showVans} onClick={() => setShowVans(!showVans)} className={`min-h-10 rounded-full px-4 py-1.5 text-sm font-semibold ${showVans ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-sand"}`}>Vans</button>
        {showVans && <Badge tone="amber">Van positions are samples until a tracker is connected</Badge>}
      </div>
      <div className="mb-4 scroll-x flex gap-1.5 pb-1" role="group" aria-label="Show projects at these stages">
        {(Object.keys(STAGES) as Stage[]).map((s) => (
          <button key={s} type="button" aria-pressed={!off.has(s)} onClick={() => toggleStage(s)} className={`flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ring-1 ${off.has(s) ? "bg-white text-mute ring-sand" : "bg-white text-ink ring-line"}`}>
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: off.has(s) ? "#d6d4c7" : STAGES[s].color }} />
            {STAGES[s].label} <span className="text-xs text-mute">{count(s)}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 @3xl:grid-cols-[1fr_340px]">
        {/* isolate: keeps Leaflet's internal z-indexes from stacking above modals and menus */}
        <Card className="relative isolate overflow-hidden">
          <div ref={mapEl} role="application" aria-label="Map of customer projects and vans. The list beside it has the same information." className="h-[60vh] w-full @3xl:h-[calc(100vh-300px)] @3xl:min-h-[480px]" />
          {(selPin || selVan) && (
            <div className="absolute inset-x-3 bottom-3 z-[500] rounded-xl border border-sand bg-white p-4 text-sm shadow-xl sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:w-72">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {selPin ? <div className="font-semibold">{selPin.name}</div> : <div className="flex items-center gap-2"><Plate>{selVan!.v.reg}</Plate></div>}
                  <div className="text-mute">{selPin ? selPin.title : `${selVan!.v.make} ${selVan!.v.model}`}</div>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-mute hover:bg-cream" aria-label="Close details">✕</button>
              </div>
              {selPin && (
                <div className="mt-2 space-y-1.5 text-xs text-ink">
                  <div><Badge tone={STAGES[selPin.stage].tone} dot>{STAGES[selPin.stage].label}</Badge></div>
                  <div className="text-mute">{selPin.address}</div>
                  {selPin.value ? <div>Price: <b>{gbp(selPin.value)}</b></div> : null}
                  {selPin.date && <div>Date: <b>{fmtDay(selPin.date)}</b></div>}
                  {selPin.vanIds.length > 0 && <div className="flex flex-wrap gap-1">{selPin.vanIds.map((id) => <Plate key={id}>{vanReg(db, id)}</Plate>)}</div>}
                  {selPin.crewIds.length > 0 && <div>Crew: {selPin.crewIds.map((id) => crewName(db, id).split(" ")[0]).join(", ")}</div>}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {selPin.leadId && <Link href={`/admin/leads?lead=${selPin.leadId}`} className="flex min-h-10 items-center rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark">Open enquiry</Link>}
                    <Link href="/admin/jobs" className="flex min-h-10 items-center rounded-lg border-[1.5px] border-line px-3 py-1.5 text-xs font-semibold hover:bg-cream">Open schedule</Link>
                  </div>
                </div>
              )}
              {selVan && (
                <div className="mt-2 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={vehicleStatus[selVan.v.status].tone} dot>{vehicleStatus[selVan.v.status].label}</Badge><span style={{ color: VAN_TEXT[selVan.p.kind] }} className="font-semibold">{VAN_LABEL[selVan.p.kind]}</span></div>
                  {selVan.p.jobTitle && <div>Working on: <b>{selVan.p.jobTitle}</b></div>}
                  <div>Driver: <b>{db.crew.find((c) => c.id === selVan.v.assignedCrewId)?.name ?? "no usual driver"}</b></div>
                  <Link href={`/admin/vans/${selVan.v.id}`} className="mt-2 flex min-h-10 items-center justify-center rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark">Open van page</Link>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="flex flex-col @3xl:h-[calc(100vh-300px)] @3xl:min-h-[480px]">
          <div className="space-y-2 border-b border-cream p-3">
            <div className="flex gap-1.5" role="group" aria-label="List">
              {(["projects", "vans"] as const).map((t) => (
                <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={`min-h-10 flex-1 rounded-lg px-3 py-1 text-sm font-semibold ${tab === t ? "bg-brand text-white" : "bg-cream text-ink"}`}>{t === "projects" ? `Projects (${listPins.length})` : `Vans (${vans.length})`}</button>
              ))}
            </div>
            <div className="relative">
              <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <input aria-label="Search the list" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "projects" ? "Customer, address or job" : "Plate or model"} className="min-h-11 w-full rounded-xl border-[1.5px] border-line py-2 pl-9 pr-3 text-base outline-none focus:border-ink" />
            </div>
          </div>
          <ul className="max-h-96 flex-1 divide-y divide-cream overflow-y-auto @3xl:max-h-none">
            {tab === "projects" && listPins.map((p) => (
              <li key={p.key}>
                <button type="button" onClick={() => { setShowProjects(true); pick(`p:${p.key}`); }} className={`flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-cream ${selected === `p:${p.key}` ? "bg-brand-tint" : ""}`}>
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STAGES[p.stage].color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-mute">{p.title}</span>
                    <span className="block truncate text-xs text-mute">{p.address}</span>
                  </span>
                  <span className="text-right text-xs">
                    <span className="block font-semibold" style={{ color: STAGES[p.stage].text }}>{STAGES[p.stage].label}</span>
                    {p.value ? <span className="block tabular-nums text-mute">{gbp(p.value)}</span> : null}
                  </span>
                </button>
              </li>
            ))}
            {tab === "projects" && listPins.length === 0 && <li className="px-5 py-10 text-center text-sm text-mute">{pins.length === 0 ? "No customer projects have a location yet. They appear here as enquiries come in and jobs are scheduled." : "Nothing matches. Check the stage chips above the map."}</li>}
            {tab === "vans" && listVans.map(({ v, p }) => (
              <li key={v.id}>
                <button type="button" onClick={() => { setShowVans(true); pick(`v:${v.id}`); }} className={`flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-cream ${selected === `v:${v.id}` ? "bg-brand-tint" : ""}`}>
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: VAN_COLOR[p.kind] }} />
                  <span className="min-w-0 flex-1"><Plate>{v.reg}</Plate> <span className="text-mute">{v.make} {v.model}</span></span>
                  <span className="text-right text-xs font-semibold" style={{ color: VAN_TEXT[p.kind] }}>{VAN_LABEL[p.kind]}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function MapPage() {
  return (
    <Suspense>
      <ProjectMap />
    </Suspense>
  );
}
