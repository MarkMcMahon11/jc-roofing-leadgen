// The assistant's brain: Claude through the official SDK. With no ANTHROPIC_API_KEY the assistant still works from simple
// rules (it just understands fewer things). A daily cap on AI calls keeps the cost predictable.

import Anthropic from "@anthropic-ai/sdk";

/** Sonnet 5.5 by default (fast and inexpensive for chat); set ASSISTANT_MODEL=claude-opus-5-5 for the most capable. */
export const MODEL = process.env.ASSISTANT_MODEL?.trim() || "claude-sonnet-5-5";
export const DAILY_CAP = Math.max(10, Number(process.env.ASSISTANT_DAILY_AI_CAP) || 300);

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

let client: Anthropic | null = null;
export function ai(): Anthropic {
  client ??= new Anthropic({ timeout: 20_000, maxRetries: 1 });
  return client;
}
