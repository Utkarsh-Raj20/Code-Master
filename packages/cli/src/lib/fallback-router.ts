import {
  findSupportedChatModel,
  type SupportedProvider,
} from "@mastercode/shared";
import { getKey, listKeys } from "./key-store";
import { getEnvironmentApiKey } from "./providers";

/**
 * Default fallback models for each provider when cascading.
 */
export const DEFAULT_FALLBACK_MODELS: Record<SupportedProvider, string> = {
  anthropic: "claude-3-7-sonnet",
  openai: "gpt-4o",
  gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "anthropic/claude-3.5-sonnet",
  deepseek: "deepseek-chat",
};

/**
 * Provider cascading priority order.
 */
export const PROVIDER_FALLBACK_PRIORITY: SupportedProvider[] = [
  "anthropic",
  "openai",
  "gemini",
  "groq",
  "openrouter",
  "deepseek",
];

const RECOVERABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504, 529]);

const RECOVERABLE_MESSAGE_PATTERNS = [
  /429/i,
  /500/i,
  /502/i,
  /503/i,
  /504/i,
  /529/i,
  /rate\s*limit/i,
  /too\s*many\s*requests/i,
  /overloaded/i,
  /capacity/i,
  /resource\s*exhausted/i,
  /temporarily\s*unavailable/i,
  /service\s*unavailable/i,
  /bad\s*gateway/i,
  /gateway\s*timeout/i,
  /timed?\s*out/i,
  /econnreset/i,
  /etimedout/i,
  /fetch\s*failed/i,
];

/**
 * Determine if an error is transient / recoverable (rate limits, outages, timeouts)
 * such that cascading to an alternative provider is appropriate.
 */
export function isRecoverableError(error: unknown): boolean {
  if (!error) return false;

  // Check status code on error object
  if (typeof error === "object") {
    const errObj = error as Record<string, any>;
    const status =
      errObj.statusCode ??
      errObj.status ??
      errObj.response?.status ??
      errObj.cause?.status;

    if (typeof status === "number" && RECOVERABLE_STATUS_CODES.has(status)) {
      return true;
    }

    if (errObj.isRetryable === true) {
      return true;
    }
  }

  // Check error message or string representation
  const message = error instanceof Error ? error.message : String(error);
  return RECOVERABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

export interface FallbackCandidate {
  modelId: string;
  provider: SupportedProvider;
  apiKey?: string;
}

/**
 * Find the next available provider and fallback model with a configured API key.
 * Excludes the current provider so the system doesn't fall back to the same failing service.
 */
export function getNextFallbackModel(
  currentModelId: string,
  currentProvider?: SupportedProvider,
): FallbackCandidate | null {
  const resolvedCurrentProvider =
    currentProvider ?? findSupportedChatModel(currentModelId)?.provider;

  // Find all configured providers
  const storedConfigured = new Set(
    listKeys()
      .filter((k) => k.isConfigured)
      .map((k) => k.provider),
  );

  for (const candidateProvider of PROVIDER_FALLBACK_PRIORITY) {
    // Don't fall back to the currently failing provider
    if (candidateProvider === resolvedCurrentProvider) continue;

    // Check stored key first, then environment variable
    const key = getKey(candidateProvider) || getEnvironmentApiKey(candidateProvider);
    if (key || storedConfigured.has(candidateProvider)) {
      const modelId = DEFAULT_FALLBACK_MODELS[candidateProvider];
      return {
        modelId,
        provider: candidateProvider,
        apiKey: key ?? undefined,
      };
    }
  }

  return null;
}

/**
 * Select the next fallback model or throw a descriptive error if no alternative has an API key.
 */
export function selectFallbackOrThrow(
  currentModelId: string,
  currentProvider?: SupportedProvider,
): FallbackCandidate {
  const fallback = getNextFallbackModel(currentModelId, currentProvider);
  if (!fallback) {
    throw new Error(
      "No alternative provider with a configured API key is available for fallback. Configure additional providers via /keys.",
    );
  }
  return fallback;
}

/**
 * Format a user-facing notice explaining the automatic model switch.
 */
export function createFallbackNotice(
  failedModel: string,
  fallbackModel: string,
  reason: string,
): string {
  return `⚠️ Model '${failedModel}' encountered a temporary issue (${reason}). Automatically falling back to '${fallbackModel}'...`;
}
