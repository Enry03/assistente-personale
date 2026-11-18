import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic();

/** Modello principale, configurabile da variabile d'ambiente. */
export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

/** Fallback lato server in caso di rifiuto del modello principale. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
