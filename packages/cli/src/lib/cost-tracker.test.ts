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
});
