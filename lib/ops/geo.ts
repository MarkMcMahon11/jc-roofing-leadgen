// Places in Dumfries and Galloway, used for the sample vans and as the map's starting view.
// Real positions come from a tracker or from the customer's address (leads and jobs carry lat/lng).

export const HQ = { lat: 55.0905, lng: -3.575, label: "JC Roofing yard, Heathhall, Dumfries" };

export const AREA_COORDS: Record<string, [number, number]> = {
  Dumfries: [55.0701, -3.6052],
  Heathhall: [55.0905, -3.575],
  Annan: [54.9877, -3.2602],
  Lockerbie: [55.1233, -3.3547],
  Moffat: [55.333, -3.441],
  "Castle Douglas": [54.9444, -3.93],
  Kirkcudbright: [54.839, -4.048],
  Dalbeattie: [54.93, -3.823],
  Gretna: [54.9936, -3.066],
  Thornhill: [55.242, -3.769],
  Sanquhar: [55.369, -3.933],
  Langholm: [55.151, -2.999],
  "Newton Stewart": [54.949, -4.476],
  Stranraer: [54.905, -5.027],
};

export const DG_CENTRE: [number, number] = [55.0, -3.9];

/** Stable pseudo-random number per string, 0..1. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export function nearestArea(lat: number, lng: number): string {
  let best = "Dumfries";
  let bd = Infinity;
  for (const [name, [a, b]] of Object.entries(AREA_COORDS)) {
    const d = (a - lat) ** 2 + (b - lng) ** 2;
    if (d < bd) {
      bd = d;
      best = name;
    }
  }
  return best;
}
