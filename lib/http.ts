export const bad = (error: string, status = 400, extra: Record<string, unknown> = {}) => Response.json({ error, ...extra }, { status });

/** Read a JSON body safely: size-capped, never throws. Returns a ready-made error Response on failure. */
export async function readJson(req: Request, maxBytes = 20_000): Promise<{ ok: true; data: unknown } | { ok: false; res: Response }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) return { ok: false, res: bad("Request too large", 413) };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, res: bad("Could not read request") };
  }
  if (text.length > maxBytes) return { ok: false, res: bad("Request too large", 413) };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, res: bad("Invalid JSON") };
  }
}

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
