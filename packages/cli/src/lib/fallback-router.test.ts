import { describe, expect, test } from "bun:test";
import {
  DEFAULT_FALLBACK_MODELS,
  getNextFallbackModel,
  isRecoverableError,
} from "./fallback-router";

describe("fallback-router", () => {
  test("should classify 429, 500, 503, 529 as recoverable errors", () => {
    for (const code of [429, 500, 503, 529]) {
      expect(isRecoverableError({ status: code })).toBe(true);
      expect(isRecoverableError({ statusCode: code })).toBe(true);
    }
  });

  test("should not treat 401 (Invalid Key) or 400 as recoverable", () => {
    expect(isRecoverableError({ status: 401 })).toBe(false);
    expect(isRecoverableError({ status: 400 })).toBe(false);
    expect(isRecoverableError(new Error("Invalid API key"))).toBe(false);
  });

  test("should select next priority provider with configured key", () => {
    const result = getNextFallbackModel("claude-3-5-sonnet", "anthropic", {
      getKey: () => null,
      listConfiguredProviders: () => [],
      getEnvironmentApiKey: (provider) => (provider === "gemini" ? "test-key" : undefined),
    });

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("gemini");
    expect(result?.apiKey).toBe("test-key");
    expect(result?.modelId).toBe(DEFAULT_FALLBACK_MODELS.gemini);
  });

  test("should return null when all providers exhausted", () => {
    const result = getNextFallbackModel("claude-3-5-sonnet", "anthropic", {
      getKey: () => null,
      listConfiguredProviders: () => [],
      getEnvironmentApiKey: () => undefined,
    });

    expect(result).toBeNull();
  });
});
