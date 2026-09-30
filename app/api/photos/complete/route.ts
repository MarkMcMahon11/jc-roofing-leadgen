import { updateLeads } from "@/lib/store";
import { downloadPhoto } from "@/lib/photos";
import { MAX_PHOTOS_PER_LEAD } from "@/lib/photos-shared";
import { assessPhoto, positionHint, visionEnabled } from "@/lib/vision";
import { bad, isObj, readJson } from "@/lib/http";
import { clientIp, limited } from "@/lib/limits";
import type { Lead, LeadPhoto } from "@/lib/types";

/**
 * Step 2 of 2: the browser calls this once its direct upload to Storage has finished. We fetch the photo back
 * server-to-server (to confirm it really exists, and - if configured - to run the AI read on it), then record it
 * on the lead. The AI call costs real money per photo (Claude, only when ANTHROPIC_API_KEY is set), so this is
 * rate-limited more tightly than the sign step.
 */
export async function POST(req: Request) {
  if (limited(`photo:complete:ip:${clientIp(req)}`, 20, 10 * 60_000)) return bad("Too many photos from your connection. Please wait a few minutes.", 429);

  const body = await readJson(req, 2_000);
  if (!body.ok) return body.res;
  const b = body.data;
  if (!isObj(b) || typeof b.leadId !== "string" || typeof b.path !== "string" || !b.path.startsWith(`${b.leadId}/`)) return bad("Invalid request");

  const file = await downloadPhoto(b.path);
  if (!file) return bad("That upload doesn't seem to have completed. Please try again.", 404);

  const assessment = visionEnabled() ? await assessPhoto(file.bytes, file.contentType) : null;
  const photo: LeadPhoto = { path: b.path, assessment };

  const result = await updateLeads((leads): { ok: true } | { error: string; status: number } => {
    const lead = leads.find((l) => l.id === b.leadId) as Lead | undefined;
    if (!lead || lead.score === "not-a-fit") return { error: "Enquiry not found", status: 404 };
    if ((lead.photos?.length ?? 0) >= MAX_PHOTOS_PER_LEAD) return { error: `You can add up to ${MAX_PHOTOS_PER_LEAD} photos.`, status: 400 };
    lead.photos = [...(lead.photos ?? []), photo];
    return { ok: true };
  });
  if ("error" in result) return bad(result.error, result.status);

  return Response.json({ ok: true, assessment, hint: positionHint(assessment?.affectedPercent ?? null) });
}
