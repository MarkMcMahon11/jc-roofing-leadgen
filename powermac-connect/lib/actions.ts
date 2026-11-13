import type { PostgrestError } from "@supabase/supabase-js";
import type { ZodError } from "zod";

export type ActionResult = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialAction: ActionResult = { ok: false };

export function fromZod(error: ZodError): ActionResult {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, message: "Please check the highlighted fields.", fieldErrors };
}

/** Turns database errors into messages a user can act on (never leaks SQL). */
export function fromDb(error: PostgrestError | null, fallback = "That could not be saved."): ActionResult {
  if (!error) return { ok: false, message: fallback };
  switch (error.code) {
    case "42501":
      return { ok: false, message: error.message.includes("row-level security") ? "You do not have permission to do that." : cleanMessage(error.message) };
    case "23505":
      return { ok: false, message: "A record with these details already exists." };
    case "23503":
      return { ok: false, message: "This is linked to other records, so it cannot be changed or removed." };
    case "23514":
    case "22023":
      return { ok: false, message: cleanMessage(error.message) };
    case "23502":
      return { ok: false, message: "A required field is missing." };
    case "22P02":
      return { ok: false, message: "One of the values is not in the right format." };
    default:
      return { ok: false, message: fallback };
  }
}

function cleanMessage(m: string) {
  // our own trigger messages are already written for people; constraint names are not
  if (/violates check constraint/.test(m)) return "One of the values is outside what is allowed.";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/** FormData -> plain object with empty strings turned into undefined. */
export function formObject(fd: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v === "string") out[k] = v.trim() === "" ? undefined : v.trim();
  }
  return out;
}
