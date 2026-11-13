/**
 * Session-wide token & cost telemetry with a per-model USD pricing registry
 * and cross-provider prompt cache discount accounting.
 *
 * Tracks three token classes:
 *  - promptTokens       — uncached input tokens (full rate)
 *  - cachedTokens       — cache *read* tokens (90% discount for Anthropic, ~80-90% for others)
 *  - cacheWriteTokens   — cache *write* tokens (25% surcharge for Anthropic)
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
  totalCacheWriteTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  turnsCount: number;
}

interface ModelUsageAccumulator {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

const PRICING_TABLE: Record<string, ModelPricing> = {
  // -------------------------------------------------------------------------
  // Anthropic
  // -------------------------------------------------------------------------
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
  "claude-3-opus": {
    inputCostPer1M: 15.0,
    outputCostPer1M: 75.0,
    cacheReadCostPer1M: 1.5,
    cacheWriteCostPer1M: 18.75,
  },
  "claude-sonnet-4-6": {
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    cacheReadCostPer1M: 0.3,
    cacheWriteCostPer1M: 3.75,
  },
  "claude-haiku-4-5": {
    inputCostPer1M: 0.8,
    outputCostPer1M: 4.0,
    cacheReadCostPer1M: 0.08,
    cacheWriteCostPer1M: 1.0,
  },
  "claude-opus-4-6": {
    inputCostPer1M: 15.0,
    outputCostPer1M: 75.0,
    cacheReadCostPer1M: 1.5,
    cacheWriteCostPer1M: 18.75,
  },

  // -------------------------------------------------------------------------
  // OpenAI
  // -------------------------------------------------------------------------
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
  "gpt-4-turbo": {
    inputCostPer1M: 10.0,
    outputCostPer1M: 30.0,
    cacheReadCostPer1M: 5.0,
  },
  "gpt-3.5-turbo": {
    inputCostPer1M: 0.5,
    outputCostPer1M: 1.5,
  },
  "gpt-5.4": {
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    cacheReadCostPer1M: 1.25,
  },
  "gpt-5.4-mini": {
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    cacheReadCostPer1M: 0.075,
  },
  "gpt-5.4-nano": {
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.2,
    cacheReadCostPer1M: 0.025,
  },

  // -------------------------------------------------------------------------
  // Google Gemini
  // -------------------------------------------------------------------------
  "gemini-2.0-flash": {
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    cacheReadCostPer1M: 0.025,
  },
  "gemini-1.5-pro": {
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.0,
    cacheReadCostPer1M: 0.3125,
  },
  "gemini-1.5-flash": {
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.3,
    cacheReadCostPer1M: 0.01875,
  },

  // -------------------------------------------------------------------------
  // Groq (Llama & Mixtral)
  // -------------------------------------------------------------------------
  "llama-3.3-70b-versatile": {
    inputCostPer1M: 0.59,
    outputCostPer1M: 0.79,
  },
  "llama-3.1-8b-instant": {
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.08,
  },
  "mixtral-8x7b-32768": {
    inputCostPer1M: 0.24,
    outputCostPer1M: 0.24,
  },

  // -------------------------------------------------------------------------
  // DeepSeek
  // -------------------------------------------------------------------------
  "deepseek-chat": {
    inputCostPer1M: 0.14,
    outputCostPer1M: 0.28,
    cacheReadCostPer1M: 0.014,
  },
  "deepseek-reasoner": {
    inputCostPer1M: 0.55,
    outputCostPer1M: 2.19,
    cacheReadCostPer1M: 0.14,
  },
  "deepseek-v4-pro": {
    inputCostPer1M: 0.55,
    outputCostPer1M: 2.19,
    cacheReadCostPer1M: 0.14,
  },

  // -------------------------------------------------------------------------
  // OpenRouter (aliases & provider prefixes)
  // -------------------------------------------------------------------------
  "anthropic/claude-3.5-sonnet": {
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    cacheReadCostPer1M: 0.3,
  },
  "openai/gpt-4o": {
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    cacheReadCostPer1M: 1.25,
  },
  "google/gemini-2.0-flash-001": {
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    cacheReadCostPer1M: 0.025,
  },
  "meta-llama/llama-3.3-70b-instruct": {
    inputCostPer1M: 0.59,
    outputCostPer1M: 0.79,
  },
};

const DEFAULT_FALLBACK_PRICING: ModelPricing = {
  inputCostPer1M: 0.5,
  outputCostPer1M: 1.5,
  cacheReadCostPer1M: 0.05,
};

function normalizeModelId(modelId: string): string {
  let normalized = modelId.toLowerCase().trim();
  if (normalized.includes("/")) {
    normalized = normalized.split("/").pop() ?? normalized;
  }
  return normalized;
}

export function resolvePricing(modelId: string): ModelPricing {
  const raw = modelId.toLowerCase().trim();

  // 1. Exact match on raw ID
  if (PRICING_TABLE[raw]) return PRICING_TABLE[raw]!;

  // 2. Normalized ID (stripping provider prefix e.g. "anthropic/claude-3.5-sonnet" -> "claude-3.5-sonnet")
  const normalized = normalizeModelId(raw);
  if (PRICING_TABLE[normalized]) return PRICING_TABLE[normalized]!;

  // 3. Normalized ID with dots replaced with dashes ("claude-3.5-sonnet" -> "claude-3-5-sonnet")
  const dashed = normalized.replace(/\./g, "-");
  if (PRICING_TABLE[dashed]) return PRICING_TABLE[dashed]!;

  // 4. Prefix match against all registered pricing entries
  for (const [key, pricing] of Object.entries(PRICING_TABLE)) {
    const normKey = normalizeModelId(key).replace(/\./g, "-");
    if (raw.startsWith(key) || normalized.startsWith(normKey) || dashed.startsWith(normKey)) {
      return pricing;
    }
  }

  // 5. Keyword heuristics to provide accurate estimates for unknown model variants
  if (normalized.includes("deepseek")) {
    return PRICING_TABLE["deepseek-chat"]!;
  }
  if (normalized.includes("gemini") || normalized.includes("flash")) {
    return PRICING_TABLE["gemini-2.0-flash"]!;
  }
  if (normalized.includes("llama") || normalized.includes("groq") || normalized.includes("mixtral")) {
    return PRICING_TABLE["llama-3.3-70b-versatile"]!;
  }
  if (normalized.includes("opus")) {
    return PRICING_TABLE["claude-3-opus"]!;
  }
  if (normalized.includes("haiku")) {
    return PRICING_TABLE["claude-3-5-haiku"]!;
  }
  if (normalized.includes("sonnet") || normalized.includes("claude")) {
    return PRICING_TABLE["claude-3-5-sonnet"]!;
  }
  if (normalized.includes("mini") || normalized.includes("nano")) {
    return PRICING_TABLE["gpt-4o-mini"]!;
  }
  if (normalized.includes("gpt")) {
    return PRICING_TABLE["gpt-4o"]!;
  }

  // 6. Non-zero fallback default so token usage always registers an estimated cost
  return DEFAULT_FALLBACK_PRICING;
}

function tokensToUsd(tokens: number, costPer1M: number): number {
  return (tokens * costPer1M) / 1_000_000;
}

export class CostTracker {
  private static totalPromptTokens = 0;
  private static totalCompletionTokens = 0;
  private static totalCachedTokens = 0;
  private static totalCacheWriteTokens = 0;
  private static turnsCount = 0;
  private static byModel = new Map<string, ModelUsageAccumulator>();

  static recordUsage(
    modelId: string,
    usage: {
      promptTokens: number;
      completionTokens: number;
      cachedTokens?: number;
      cacheWriteTokens?: number;
    },
  ): void {
    const pricing = resolvePricing(modelId);
    const cachedTokens = usage.cachedTokens ?? 0;
    const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
    const uncachedPromptTokens = Math.max(0, usage.promptTokens - cachedTokens);

    const cacheReadRate =
      pricing.cacheReadCostPer1M ?? pricing.inputCostPer1M * 0.1;
    const cacheWriteRate =
      pricing.cacheWriteCostPer1M ?? pricing.inputCostPer1M * 1.25;

    const costUsd =
      tokensToUsd(uncachedPromptTokens, pricing.inputCostPer1M) +
      tokensToUsd(cachedTokens, cacheReadRate) +
      tokensToUsd(cacheWriteTokens, cacheWriteRate) +
      tokensToUsd(usage.completionTokens, pricing.outputCostPer1M);

    this.totalPromptTokens += usage.promptTokens;
    this.totalCompletionTokens += usage.completionTokens;
    this.totalCachedTokens += cachedTokens;
    this.totalCacheWriteTokens += cacheWriteTokens;
    this.turnsCount += 1;

    const existing = this.byModel.get(modelId) ?? {
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
    };
    existing.promptTokens += usage.promptTokens;
    existing.completionTokens += usage.completionTokens;
    existing.cachedTokens += cachedTokens;
    existing.cacheWriteTokens += cacheWriteTokens;
    existing.costUsd += costUsd;
    this.byModel.set(modelId, existing);
  }

  static getSummary(): SessionCostSummary {
    const totalPromptTokens = this.totalPromptTokens;
    const totalCompletionTokens = this.totalCompletionTokens;
    const totalCachedTokens = this.totalCachedTokens;
    const totalCacheWriteTokens = this.totalCacheWriteTokens;

    let totalCostUsd = 0;
    for (const entry of this.byModel.values()) {
      totalCostUsd += entry.costUsd;
    }

    return {
      totalPromptTokens,
      totalCompletionTokens,
      totalCachedTokens,
      totalCacheWriteTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      totalCostUsd,
      turnsCount: this.turnsCount,
    };
  }

  static formatCost(): string {
    const cost = this.getSummary().totalCostUsd;
    if (cost <= 0) return "$0.00";
    if (cost < 0.0001) return "<$0.0001";
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  }

  static formatTokens(): string {
    const { totalTokens, totalCachedTokens } = this.getSummary();
    const fmt = (n: number) => {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
      return String(n);
    };

    if (totalCachedTokens > 0) {
      return `${fmt(totalTokens)} (${fmt(totalCachedTokens)} cached)`;
    }
    return fmt(totalTokens);
  }

  static reset(): void {
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.totalCachedTokens = 0;
    this.totalCacheWriteTokens = 0;
    this.turnsCount = 0;
    this.byModel.clear();
  }
}
