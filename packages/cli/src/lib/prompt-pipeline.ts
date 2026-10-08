import type { ModeType, SupportedChatModelId, SupportedProvider } from "@mastercode/shared";
import { runPromptHook, type HookContext } from "./prompt-hooks";
import { rewritePrompt } from "./prompt-rewriter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromptPipelineParams = {
  rawInput: string;
  projectRoot: string;
  mode: ModeType;
  model: SupportedChatModelId;
  provider: SupportedProvider;
  apiKey?: string | null;
  optimizePrompt: boolean;
  onWarning?: (msg: string) => void;
};

export type PromptPipelineResult = {
  finalPrompt: string;
  wasRewritten: boolean;
  hookExecuted: boolean;
};

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Orchestrates the 4-stage prompt execution pipeline:
 *
 * Stage 1 – Lifecycle hook (project-level userPromptSubmit script)
 * Stage 2 – Fast LLM meta-prompting rewriter (only when optimizePrompt=true)
 * Stage 3 – Context injection is handled separately in system-prompt.ts
 * Stage 4 – Main agent streaming (caller's responsibility)
 *
 * This function is deliberately non-blocking: any stage that fails falls back
 * gracefully, leaving the prompt unchanged, so the main chat is never blocked.
 */
export async function runPromptPipeline(
  params: PromptPipelineParams,
): Promise<PromptPipelineResult> {
  const { rawInput, projectRoot, mode, model, provider, apiKey, optimizePrompt, onWarning } =
    params;

  const hookCtx: HookContext = { projectRoot, mode, model };

  // Stage 1: Run project-level hook
  const { prompt: hookedPrompt, hookExecuted } = await runPromptHook(
    rawInput,
    hookCtx,
    onWarning,
  );

  // Stage 2: Rewrite with fast LLM (only when toggle is on)
  if (optimizePrompt) {
    const { rewrittenPrompt, wasRewritten } = await rewritePrompt(
      hookedPrompt,
      provider,
      model,
      apiKey,
    );
    return { finalPrompt: rewrittenPrompt, wasRewritten, hookExecuted };
  }

  return { finalPrompt: hookedPrompt, wasRewritten: false, hookExecuted };
}
