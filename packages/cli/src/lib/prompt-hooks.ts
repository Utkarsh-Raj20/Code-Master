import path from "node:path";
import fs from "node:fs";
import type { ModeType, SupportedChatModelId } from "@mastercode/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HookContext = {
  projectRoot: string;
  mode: ModeType;
  model: SupportedChatModelId;
};

type HookFn = (prompt: string, ctx: HookContext) => Promise<string> | string;

// ---------------------------------------------------------------------------
// Hook discovery
// ---------------------------------------------------------------------------

const HOOK_SEARCH_PATHS = [
  ".mastercode/hooks/userPromptSubmit.ts",
  ".mastercode/hooks/userPromptSubmit.js",
  ".config/hooks/userPromptSubmit.ts",
  ".config/hooks/userPromptSubmit.js",
  ".hooks/userPromptSubmit.ts",
  ".hooks/userPromptSubmit.js",
];

const HOOK_TIMEOUT_MS = 4_000;

/**
 * Resolves the first hook script found, searching from `projectRoot`.
 * Returns `null` if no hook script exists.
 */
function findHookScript(projectRoot: string): string | null {
  for (const rel of HOOK_SEARCH_PATHS) {
    const candidate = path.join(projectRoot, rel);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Runs the project-level hook (if one exists) against `rawPrompt`.
 *
 * - If the hook file is missing -> returns `rawPrompt` unchanged.
 * - If the hook times-out or throws -> returns `rawPrompt` unchanged and
 *   calls `onWarning` with the error message.
 * - Execution is wrapped in `Promise.race` with a 4-second safety timeout.
 */
export async function runPromptHook(
  rawPrompt: string,
  ctx: HookContext,
  onWarning?: (msg: string) => void,
): Promise<{ prompt: string; hookExecuted: boolean }> {
  const hookPath = findHookScript(ctx.projectRoot);
  if (!hookPath) {
    return { prompt: rawPrompt, hookExecuted: false };
  }

  try {
    // Dynamic import works natively under Bun for both .ts and .js
    const module = await import(hookPath);
    const fn: HookFn | undefined =
      typeof module.default === "function" ? module.default : undefined;

    if (!fn) {
      onWarning?.(`Hook at ${hookPath} has no default export function — skipping.`);
      return { prompt: rawPrompt, hookExecuted: false };
    }

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Hook timed out after 4 s")), HOOK_TIMEOUT_MS),
    );

    const result = await Promise.race([Promise.resolve(fn(rawPrompt, ctx)), timeout]);
    return { prompt: typeof result === "string" ? result : rawPrompt, hookExecuted: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onWarning?.(`Prompt hook failed (${message}) — using original prompt.`);
    return { prompt: rawPrompt, hookExecuted: false };
  }
}
