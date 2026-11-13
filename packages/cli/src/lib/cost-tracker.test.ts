import { beforeEach, describe, expect, test } from "bun:test";
import { CostTracker } from "./cost-tracker";

beforeEach(() => {
  CostTracker.reset();
});

describe("CostTracker", () => {
  test("should correctly compute cost for Claude 3.5 Sonnet tokens", () => {
    CostTracker.recordUsage("claude-3-5-sonnet", {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    });

    const summary = CostTracker.getSummary();
    expect(summary.totalPromptTokens).toBe(1_000_000);
    expect(summary.totalCompletionTokens).toBe(1_000_000);
    expect(summary.totalTokens).toBe(2_000_000);
    // $3.00/1M input + $15.00/1M output = $18.00
    expect(summary.totalCostUsd).toBeCloseTo(18.0, 5);
  });

  test("should apply 90% prompt cache discount when cachedTokens are present", () => {
    CostTracker.recordUsage("claude-3-5-sonnet", {
      promptTokens: 1_000_000,
      completionTokens: 0,
      cachedTokens: 800_000, // 800k cached @ $0.30/1M, 200k uncached @ $3.00/1M
    });

    const summary = CostTracker.getSummary();
    expect(summary.totalCachedTokens).toBe(800_000);
    // 200k * $3.00/1M = $0.60
    // 800k * $0.30/1M = $0.24
    // total = $0.84 (vs $3.00 uncached!)
    expect(summary.totalCostUsd).toBeCloseTo(0.84, 5);
  });

  test("should account for Anthropic cache write tokens (25% surcharge)", () => {
    CostTracker.recordUsage("claude-3-5-sonnet", {
      promptTokens: 1_000_000,
      completionTokens: 0,
      cacheWriteTokens: 500_000, // 500k write @ $3.75/1M
    });

    const summary = CostTracker.getSummary();
    expect(summary.totalCacheWriteTokens).toBe(500_000);
    // 1M prompt * $3.00/1M = $3.00
    // 500k write * $3.75/1M = $1.875
    // total = $4.875
    expect(summary.totalCostUsd).toBeCloseTo(4.875, 3);
  });

  test("should correctly compute cost for GPT-4o-mini tokens", () => {
    CostTracker.recordUsage("gpt-4o-mini", {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    });

    // $0.15/1M input + $0.60/1M output = $0.75
    expect(CostTracker.getSummary().totalCostUsd).toBeCloseTo(0.75, 5);
  });

  test("should accumulate multiple turns accurately", () => {
    CostTracker.recordUsage("claude-3-5-sonnet", { promptTokens: 1000, completionTokens: 2000 });
    CostTracker.recordUsage("gpt-4o", { promptTokens: 3000, completionTokens: 4000 });

    const summary = CostTracker.getSummary();
    expect(summary.turnsCount).toBe(2);
    expect(summary.totalPromptTokens).toBe(4000);
    expect(summary.totalCompletionTokens).toBe(6000);
    expect(summary.totalTokens).toBe(10_000);
  });

  test("should format tokens and cost into human-readable strings", () => {
    CostTracker.recordUsage("claude-3-5-sonnet", { promptTokens: 12_000, completionTokens: 400 });

    expect(CostTracker.formatTokens()).toBe("12.4k");
    expect(CostTracker.formatCost()).toMatch(/^\$\d+\.\d{2}$/);

    CostTracker.reset();
    expect(CostTracker.formatTokens()).toBe("0");
    expect(CostTracker.formatCost()).toBe("$0.00");
  });

  test("should show cached token count in formatTokens when cache hits exist", () => {
    CostTracker.recordUsage("claude-3-5-sonnet", {
      promptTokens: 10_000,
      completionTokens: 500,
      cachedTokens: 8_000,
    });

    // Total = 10.5k, cached = 8k → "10.5k (8.0k cached)"
    expect(CostTracker.formatTokens()).toBe("10.5k (8.0k cached)");
  });

  test("should prefix-match versioned model IDs for pricing", () => {
    // claude-3-7-sonnet-20250219 should match "claude-3-7-sonnet" pricing
    CostTracker.recordUsage("claude-3-7-sonnet-20250219", {
      promptTokens: 1_000_000,
      completionTokens: 0,
    });
    // $3.00/1M
    expect(CostTracker.getSummary().totalCostUsd).toBeCloseTo(3.0, 5);
  });

  test("should compute non-zero cost for DeepSeek models", () => {
    CostTracker.recordUsage("deepseek-chat", {
      promptTokens: 10_000,
      completionTokens: 2_000,
    });
    const summary = CostTracker.getSummary();
    // 10k * $0.14/1M + 2k * $0.28/1M = $0.0014 + $0.00056 = $0.00196
    expect(summary.totalCostUsd).toBeGreaterThan(0);
    expect(summary.totalCostUsd).toBeCloseTo(0.00196, 5);
    expect(CostTracker.formatCost()).toBe("$0.0020");
  });

  test("should compute non-zero cost for Groq and Gemini models", () => {
    CostTracker.recordUsage("llama-3.3-70b-versatile", {
      promptTokens: 5_000,
      completionTokens: 1_000,
    });
    expect(CostTracker.getSummary().totalCostUsd).toBeGreaterThan(0);

    CostTracker.reset();
    CostTracker.recordUsage("gemini-1.5-flash", {
      promptTokens: 20_000,
      completionTokens: 5_000,
    });
    expect(CostTracker.getSummary().totalCostUsd).toBeGreaterThan(0);
  });

  test("should resolve pricing for OpenRouter models with provider prefix", () => {
    CostTracker.recordUsage("anthropic/claude-3.5-sonnet", {
      promptTokens: 100_000,
      completionTokens: 10_000,
    });
    // 100k * $3/1M + 10k * $15/1M = $0.30 + $0.15 = $0.45
    expect(CostTracker.getSummary().totalCostUsd).toBeCloseTo(0.45, 3);
  });

  test("should format tiny micro-costs as <$0.0001 instead of $0.00", () => {
    CostTracker.recordUsage("gemini-2.0-flash", {
      promptTokens: 100, // 100 * $0.10/1M = $0.00001
      completionTokens: 0,
    });
    expect(CostTracker.getSummary().totalCostUsd).toBeGreaterThan(0);
    expect(CostTracker.formatCost()).toBe("<$0.0001");
  });

  test("should provide non-zero fallback cost for completely unknown models", () => {
    CostTracker.recordUsage("custom-finetuned-llama-model-xyz", {
      promptTokens: 10_000,
      completionTokens: 2_000,
    });
    expect(CostTracker.getSummary().totalCostUsd).toBeGreaterThan(0);
  });
});
