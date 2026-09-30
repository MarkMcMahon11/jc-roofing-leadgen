// Turns one roof photo into a short, honest, plain-English read: material guess, condition, roughly how much of the
// visible roof looks affected, and how confident that read is. This is a rough visual impression, not a survey - it
// is shown alongside the existing price range (never in place of it), and always paired with the same "confirmed at
// your free inspection" line used everywhere else in this app. Off by default: needs ANTHROPIC_API_KEY.
import Anthropic from "@anthropic-ai/sdk";

export const visionEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export type PhotoAssessment = {
  material: string;
  condition: string;
  affectedPercent: number | null;
  confidence: "low" | "medium" | "high";
  caveat: string;
};

const PROMPT = `You are helping a small Scottish roofing company's customers get a rough, honest first read on a photo of their roof, or a problem area, before a real inspection.

Look at the photo and reply with ONLY a JSON object (no other text before or after it), matching exactly this shape:
{"material": string, "condition": string, "affected_percent": number|null, "confidence": "low"|"medium"|"high", "caveat": string}

- "material": your best guess at the roofing material visible, e.g. "concrete tile", "natural slate", "clay tile", "asphalt/felt flat roof", or "unclear" if you can't tell.
- "condition": one short, plain-English sentence describing what you can actually see (damage, wear, moss, missing pieces, staining, etc.). No jargon, no invented detail.
- "affected_percent": your best rough estimate, 0-100, of how much of the VISIBLE roof area looks like it needs work. Use null if the photo doesn't show enough of the roof to judge, or this doesn't apply (e.g. a close-up of one broken tile with no sense of scale).
- "confidence": be honest. Use "low" whenever the photo is distant, unclear, badly lit, taken at an odd angle, or simply doesn't show enough - do not inflate this to seem more helpful.
- "caveat": one short, honest sentence about anything that limits how reliable this read is (distance, angle, lighting, partial view, etc.), or "" if genuinely none.

This is a rough visual impression only, not a survey or a quote. Never state a price. Never claim certainty you don't have.`;

/**
 * Ask Claude to look at one roof photo. Returns null (never throws) when analysis isn't configured or fails -
 * the photo itself always still uploads and is shown to the owner either way.
 */
export async function assessPhoto(bytes: ArrayBuffer, mediaType: string): Promise<PhotoAssessment | null> {
  if (!visionEnabled()) return null;
  const mt = (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType) ? mediaType : "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "image/gif";
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-sonnet-5", // classification-style task: a capable model at low effort, not the heaviest one
      max_tokens: 1024,
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mt, data: Buffer.from(bytes).toString("base64") } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed.material !== "string" || typeof parsed.condition !== "string") return null;
    const pct = parsed.affected_percent;
    return {
      material: parsed.material.slice(0, 60),
      condition: parsed.condition.slice(0, 220),
      affectedPercent: typeof pct === "number" && Number.isFinite(pct) && pct >= 0 && pct <= 100 ? Math.round(pct) : null,
      confidence: parsed.confidence === "medium" || parsed.confidence === "high" ? parsed.confidence : "low",
      caveat: typeof parsed.caveat === "string" ? parsed.caveat.slice(0, 200) : "",
    };
  } catch (e) {
    console.error("[vision] photo assessment failed:", (e as Error).message);
    return null;
  }
}

/** A plain-English hint for where the photo suggests things fall within the price range already shown - never a new number. */
export function positionHint(affectedPercent: number | null): string | null {
  if (affectedPercent === null) return null;
  if (affectedPercent < 20) return "towards the lower end of the range above";
  if (affectedPercent < 50) return "roughly in the middle of the range above";
  return "towards the higher end of the range above, or beyond it if it's more extensive than the photo shows";
}
