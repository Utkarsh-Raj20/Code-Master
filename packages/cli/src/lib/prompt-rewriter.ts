import { generateText } from "ai";
import { resolveChatModel } from "./providers";
import type { SupportedProvider } from "@mastercode/shared";

// ---------------------------------------------------------------------------
// Fast model per provider
// ---------------------------------------------------------------------------

const FAST_MODEL_MAP: Record<string, string> = {
  anthropic: "claude-3-5-haiku-20241022",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "anthropic/claude-3.5-haiku",
  deepseek: "deepseek-chat",
};

function getFastModelId(provider: string, fallbackModel: string): string {
  return FAST_MODEL_MAP[provider] ?? fallbackModel;
}

// ---------------------------------------------------------------------------
// Meta-prompt template
// ---------------------------------------------------------------------------

const META_PROMPT = `You are a prompt engineering assistant. Your job is to rewrite the user's raw coding request into a structured, precise prompt optimised for a coding AI agent.

Rules:
- Strip all polite filler, greetings, and conversational preamble.
- Identify the task archetype: Build | Debug | Refactor | Review | Explore.
- Output ONLY the following XML block — nothing else before or after it.

<task_type>[one of: Build | Debug | Refactor | Review | Explore]</task_type>
<objective>[concise, action-oriented statement of what must be achieved]</objective>
<execution_guardrails>[2-4 bullet constraints or scope limits that keep the agent focused]</execution_guardrails>`;

// ---------------------------------------------------------------------------
// Rewriter
// ---------------------------------------------------------------------------

export type RewriteResult = {
  rewrittenPrompt: string;
  wasRewritten: boolean;
};

/**
 * Calls a fast model to rewrite `rawPrompt` into structured XML.
 *
 * Non-blocking: any failure (missing key, network error, etc.) returns the
 * original prompt with `wasRewritten: false` so the main chat is unaffected.
 */
export async function rewritePrompt(
  rawPrompt: string,
  provider: SupportedProvider,
  activeModelId: string,
  apiKey?: string | null,
): Promise<RewriteResult> {
  const fastModelId = getFastModelId(provider, activeModelId);

  try {
    const resolved = resolveChatModel({
      modelId: fastModelId,
      apiKey: apiKey ?? undefined,
      providerOverride: provider,
    });

    const { text } = await generateText({
      model: resolved.model,
      system: META_PROMPT,
      prompt: rawPrompt,
      maxTokens: 512,
      providerOptions: resolved.providerOptions,
    });

    const trimmed = text.trim();
    if (!trimmed) {
      return { rewrittenPrompt: rawPrompt, wasRewritten: false };
    }

    return { rewrittenPrompt: trimmed, wasRewritten: true };
  } catch {
    // Non-blocking fallback — return original prompt unchanged
    return { rewrittenPrompt: rawPrompt, wasRewritten: false };
  }
}
