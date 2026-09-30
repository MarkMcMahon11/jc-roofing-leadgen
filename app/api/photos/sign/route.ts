import { randomUUID } from "crypto";
import { getLeads } from "@/lib/store";
import { createUploadUrl, photosEnabled } from "@/lib/photos";
import { isPhotoMime, MAX_PHOTOS_PER_LEAD, photoExt } from "@/lib/photos-shared";
import { bad, isObj, readJson } from "@/lib/http";
import { clientIp, limited } from "@/lib/limits";

/**
 * Step 1 of 2: hand the browser a one-time permission to upload directly to Supabase Storage. The actual photo
 * bytes never pass through this server, so a "highest quality" phone photo isn't capped by our host's request-body
 * limit. Nothing is recorded on the lead yet - see /api/photos/complete for that.
 */
export async function POST(req: Request) {
  if (!photosEnabled()) return bad("Adding photos isn't available yet. You can still book your inspection without one.", 503);
  if (limited(`photo:sign:ip:${clientIp(req)}`, 30, 10 * 60_000)) return bad("Too many photos from your connection. Please wait a few minutes.", 429);

  const body = await readJson(req, 2_000);
  if (!body.ok) return body.res;
  const b = body.data;
  if (!isObj(b) || typeof b.leadId !== "string" || b.leadId.length > 80 || typeof b.contentType !== "string") return bad("Invalid request");
  if (!isPhotoMime(b.contentType)) return bad("Please choose a JPEG, PNG, WEBP or HEIC photo.");

  const leads = await getLeads();
  const lead = leads.find((l) => l.id === b.leadId);
  if (!lead || lead.score === "not-a-fit") return bad("Enquiry not found", 404);
  if ((lead.photos?.length ?? 0) >= MAX_PHOTOS_PER_LEAD) return bad(`You can add up to ${MAX_PHOTOS_PER_LEAD} photos.`);

  const path = `${lead.id}/${randomUUID()}.${photoExt(b.contentType)}`;
  try {
    const uploadUrl = await createUploadUrl(path);
    return Response.json({ uploadUrl, path });
  } catch (e) {
    console.error("[photos] could not create an upload slot:", (e as Error).message);
    return bad("Could not prepare that upload just now. Please try again.", 503);
  }
}
