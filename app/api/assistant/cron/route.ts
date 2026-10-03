import { timingSafeEqual } from "node:crypto";
import { dailyRound } from "@/lib/assistant/reminders";

export const maxDuration = 60;

/** Vercel Cron calls this each morning with "Authorization: Bearer <CRON_SECRET>". Nothing else can run it. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ error: "CRON_SECRET isn't set" }, { status: 503 });
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await dailyRound());
}
