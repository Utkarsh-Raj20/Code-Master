/**
 * Session-wide token & cost telemetry with a per-model USD pricing registry
 * and cross-provider prompt cache discount accounting.
 */

export interface ModelPricing {
  inputCostPer1M: number;
  outputCostPer1M: number;
  cacheReadCostPer1M?: number;  // typically 90% cheaper than base input
  cacheWriteCostPer1M?: number; // 25% surcharge for cache creation
}

export interface SessionCostSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCachedTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  turnsCount: number;
}

interface ModelUsageAccumulator {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  costUsd: number;
}

const PRICING_TABLE: Record<string, ModelPricing> = {
  "claude-3-7-sonnet": {
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    cacheReadCostPer1M: 0.3,
    cacheWriteCostPer1M: 3.75,
  },
  "claude-3-5-sonnet": {
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    cacheReadCostPer1M: 0.3,
    cacheWriteCostPer1M: 3.75,
  },
  "claude-3-5-haiku": {
    inputCostPer1M: 0.8,
    outputCostPer1M: 4.0,
    cacheReadCostPer1M: 0.08,
    cacheWriteCostPer1M: 1.0,
  },
  "gpt-4o": {
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    cacheReadCostPer1M: 1.25,
  },
  "gpt-4o-mini": {
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    cacheReadCostPer1M: 0.075,
  },
  "gemini-2.0-flash": {
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    cacheReadCostPer1M: 0.025,
  },
};

const UNKNOWN_PRICING: ModelPricing = { inputCostPer1M: 0, outputCostPer1M: 0 };

function resolvePricing(modelId: string): ModelPricing {
  return PRICING_TABLE[modelId] ?? UNKNOWN_PRICING;
}

function tokensToUsd(tokens: number, costPer1M: number): number {
  return (tokens * costPer1M) / 1_000_000;
}

export class CostTracker {
  private static totalPromptTokens = 0;
  private static totalCompletionTokens = 0;
  private static totalCachedTokens = 0;
  private static turnsCount = 0;
  private static byModel = new Map<string, ModelUsageAccumulator>();

  static recordUsage(
    modelId: string,
    usage: {
      promptTokens: number;
      completionTokens: number;
      cachedTokens?: number;
    },
  ): void {
    const pricing = resolvePricing(modelId);
    const cachedTokens = usage.cachedTokens ?? 0;
    const uncachedPromptTokens = Math.max(0, usage.promptTokens - cachedTokens);

    const cacheReadRate =
      pricing.cacheReadCostPer1M ?? pricing.inputCostPer1M * 0.1;

    const costUsd =
      tokensToUsd(uncachedPromptTokens, pricing.inputCostPer1M) +
      tokensToUsd(cachedTokens, cacheReadRate) +
      tokensToUsd(usage.completionTokens, pricing.outputCostPer1M);

    this.totalPromptTokens += usage.promptTokens;
    this.totalCompletionTokens += usage.completionTokens;
    this.totalCachedTokens += cachedTokens;
    this.turnsCount += 1;

    const existing = this.byModel.get(modelId) ?? {
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
    };
    existing.promptTokens += usage.promptTokens;
    existing.completionTokens += usage.completionTokens;
    existing.cachedTokens += cachedTokens;
    existing.costUsd += costUsd;
    this.byModel.set(modelId, existing);
  }

  static getSummary(): SessionCostSummary {
    const totalPromptTokens = this.totalPromptTokens;
    const totalCompletionTokens = this.totalCompletionTokens;
    const totalCachedTokens = this.totalCachedTokens;

    let totalCostUsd = 0;
    for (const entry of this.byModel.values()) {
      totalCostUsd += entry.costUsd;
    }

    return {
      totalPromptTokens,
      totalCompletionTokens,
      totalCachedTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      totalCostUsd,
      turnsCount: this.turnsCount,
    };
  }

  static formatCost(): string {
    const cost = this.getSummary().totalCostUsd;
    if (cost <= 0) return "$0.00";
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  }

  static formatTokens(): string {
    const tokens = this.getSummary().totalTokens;
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
    return String(tokens);
  }

  static reset(): void {
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.totalCachedTokens = 0;
    this.turnsCount = 0;
    this.byModel.clear();
  }
}
