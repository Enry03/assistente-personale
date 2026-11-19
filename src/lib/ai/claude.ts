import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic();

/**
 * Modello principale, configurabile da variabile d'ambiente.
 * Default Haiku 5.5 (costo minimo); per più qualità: claude-sonnet-5-5 o claude-opus-5-5.
 */
export const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

/** Fallback lato server in caso di rifiuto: disponibile su Opus 5.5 e Sonnet 5.5, non su Haiku. */
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-2"];
export const FALLBACK_PARAMS: { betas?: Anthropic.Beta.AnthropicBeta[]; fallbacks?: "default" } = FALLBACK_MODELS.includes(MODEL)
  ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
  : {};

export function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
