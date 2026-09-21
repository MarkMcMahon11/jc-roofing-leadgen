// The jobs JC Roofing takes on, and the questions each one asks. Pure data: safe for browser and server.
export const SERVICE_IDS = ["roof", "repair", "flat", "gutters", "chimney", "solar", "other"] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];

export const SERVICE_INFO: Record<ServiceId, { label: string; blurb: string }> = {
  roof: { label: "New roof", blurb: "Slate or tile re-roof" },
  repair: { label: "Roof repair", blurb: "Leaks, slipped slates, ridge or flashing" },
  flat: { label: "Flat roof", blurb: "GRP fibreglass" },
  gutters: { label: "Gutters & fascias", blurb: "Cleaning or replacement" },
  chimney: { label: "Chimney removal", blurb: "Take a chimney down" },
  solar: { label: "Solar panels", blurb: "Supply and installation" },
  other: { label: "Something else", blurb: "Tell us about the job" },
};

export type Opt = readonly [value: string, label: string];
export const OPTIONS = {
  repairIssue: [["leak", "Leak or damp patch"], ["slates", "Slipped or missing slates or tiles"], ["ridge", "Ridge, valley or flashing"], ["unsure", "Not sure"]],
  flatSize: [["small", "Small: garage, porch or dormer (about 10 m²)"], ["medium", "Medium: extension (about 25 m²)"], ["large", "Large: about 45 m² or more"], ["unsure", "Not sure"]],
  gutterWork: [["clean", "Gutter cleaning"], ["replace", "New gutters"], ["replace-fascia", "New gutters and fascias"]],
  chimneys: [["1", "1 chimney"], ["2", "2 chimneys"], ["3", "3 or more"]],
  chimneyScope: [["roof-level", "Down to roof level, roof made good"], ["full", "Full removal, including inside the roof space"]],
  solarSize: [["3", "3 kW: small home, about 8 panels"], ["4", "4 kW: typical home, about 10 panels"], ["6", "6 kW: large home, about 15 panels"], ["unsure", "Not sure"]],
} as const satisfies Record<string, readonly Opt[]>;
export const optLabel = (list: readonly Opt[], v: string | undefined) => list.find(([k]) => k === v)?.[1] ?? "";

// What each price setting is called on the owner page.
export const PRICE_LABELS: Record<string, string> = {
  repairMin: "Smallest repair (£)",
  flatRatePerM2: "Flat roof, per m² (£)",
  flatMin: "Flat roof minimum job (£)",
  gutterCleanFrom: "Gutter cleaning, average house (£)",
  gutterReplacePerM: "New gutters, per metre (£)",
  fasciaPerM: "Fascias and soffits, per metre (£)",
  chimneyEach: "Chimney removal, each (£)",
  chimneyFullExtra: "Extra for full removal inside the roof space, each (£)",
  chimneyAccess: "Scaffold or access for chimney work (£)",
  solarPerKw: "Solar panels, per kW installed (£)",
};

/** One short sentence about the job details, for messages and the owner page. */
export function detailsText(l: { service?: ServiceId; material?: string; colour?: string; repairIssue?: string; flatSize?: string; gutterWork?: string; chimneys?: string; chimneyScope?: string; solarSize?: string; notes?: string }, materialLabel?: string) {
  switch (l.service ?? "roof") {
    case "roof": return `${materialLabel ?? l.material ?? ""}${l.colour ? ` (${l.colour})` : ""}`.trim();
    case "repair": return optLabel(OPTIONS.repairIssue, l.repairIssue);
    case "flat": return optLabel(OPTIONS.flatSize, l.flatSize).split(":")[0];
    case "gutters": return optLabel(OPTIONS.gutterWork, l.gutterWork);
    case "chimney": return `${optLabel(OPTIONS.chimneys, l.chimneys)}, ${optLabel(OPTIONS.chimneyScope, l.chimneyScope).split(",")[0].toLowerCase()}`;
    case "solar": return optLabel(OPTIONS.solarSize, l.solarSize).split(":")[0];
    case "other": return (l.notes ?? "").slice(0, 120);
  }
}
