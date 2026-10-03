import { ownerSession, unauthorized } from "@/lib/server/auth";
import { loadBackground } from "@/lib/server/background";

/** The owner's uploaded picture. The page asks for it with ?v=<rev>, so it can be cached for good. */
export async function GET() {
  if (!(await ownerSession())) return unauthorized();
  const b = await loadBackground();
  const m = b.image?.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) return new Response(null, { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), { headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
