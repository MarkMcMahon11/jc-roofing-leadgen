import { randomUUID } from "crypto";
import { addLead, getSettings } from "@/lib/store";
import { getRoofArea } from "@/lib/roof";
import { earliestStart, inServiceArea, jobDays, priceRange, scoreLead } from "@/lib/pricing";
import { notify } from "@/lib/notify";
import type { Lead, QuoteInput } from "@/lib/types";

// Public config for the form (no owner contact details).
export async function GET() {
  const s = await getSettings();
  return Response.json({
    businessName: s.businessName,
    paused: s.paused,
    serviceAreaPrefixes: s.serviceAreaPrefixes,
    materials: s.materials.map(({ id, label, blurb, colours }) => ({ id, label, blurb, colours })),
  });
}

export async function POST(req: Request) {
  const input = (await req.json()) as QuoteInput;
  const s = await getSettings();
  if (!input.name || !input.phone || !input.email || !input.postcode || !input.consent)
    return Response.json({ error: "Missing details" }, { status: 400 });
  if (!s.materials.some((m) => m.id === input.material))
    return Response.json({ error: "Unknown material" }, { status: 400 });

  const { area, source } = await getRoofArea(input);
  const { low, high } = priceRange(input, area, s);
  const lead: Lead = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    roofAreaM2: area,
    roofSource: source,
    low,
    high,
    earliestStart: earliestStart(s, jobDays(area, input, s)),
    score: s.paused ? "warm" : scoreLead(input, area, s),
    status: "new",
  };
  await addLead(lead);
  notify(lead, s).catch(console.error);
  return Response.json({
    id: lead.id,
    inArea: inServiceArea(input.postcode, s),
    score: lead.score,
    low,
    high,
    roofAreaM2: area,
    earliestStart: lead.earliestStart,
    paused: s.paused,
  });
}
