// A small tool-using loop around the Messages API (the model asks for data or actions; we run them and reply).
// The tools themselves decide what is allowed: the model never touches the system directly.

import type Anthropic from "@anthropic-ai/sdk";
import { ai, MODEL } from "./llm";

export type Turn = { role: "user" | "assistant"; content: string };

/** The API wants alternating turns that start with the user. */
export function normaliseTurns(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of turns) {
    if (!out.length && t.role !== "user") continue;
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content += `\n${t.content}`;
    else out.push({ ...t });
  }
  return out;
}

export async function runAgent(opts: {
  system: string;
  turns: Turn[];
  tools: Anthropic.Tool[];
  exec: (name: string, input: unknown) => Promise<string>;
  maxTurns?: number;
}): Promise<string | null> {
  const messages: Anthropic.MessageParam[] = normaliseTurns(opts.turns).map((t) => ({ role: t.role, content: t.content }));
  const deadline = Date.now() + 40_000; // serverless functions stop at 60 s: give up in time to fall back to the simple rules
  try {
    for (let i = 0; i < (opts.maxTurns ?? 6); i++) {
      if (Date.now() > deadline) return null;
      const res = await ai().messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: opts.system,
        tools: opts.tools,
        messages,
        output_config: { effort: "low" },
      });
      if (res.stop_reason === "refusal") return null;
      const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || !calls.length) {
        const text = res.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return text || null;
      }
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const c of calls) {
        let content: string;
        let is_error = false;
        try {
          content = await opts.exec(c.name, c.input);
        } catch (e) {
          const issues = (e as { issues?: { path: (string | number)[]; message: string }[] }).issues;
          content = `Error: ${Array.isArray(issues) ? issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") : (e as Error).message}`;
          is_error = true;
        }
        results.push({ type: "tool_result", tool_use_id: c.id, content: content.slice(0, 6000), ...(is_error ? { is_error } : {}) });
      }
      messages.push({ role: "user", content: results });
    }
    return null;
  } catch (e) {
    console.error("[assistant] AI failed:", (e as Error).message);
    return null;
  }
}

/** Customer-written text is shown to the model as data inside tags, never as instructions. */
export const untrusted = (s: string) => `<data>${s.replace(/</g, "‹").replace(/>/g, "›")}</data>`;

export const obj = (properties: Record<string, unknown>, required: string[] = []): Anthropic.Tool["input_schema"] => ({ type: "object", properties, required, additionalProperties: false } as Anthropic.Tool["input_schema"]);
