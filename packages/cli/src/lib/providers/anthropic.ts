import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { AIProvider } from "./index";

const ANTHROPIC_PROVIDER_OPTIONS: Record<string, ProviderOptions> = {
  "claude-opus-4-6": {
    anthropic: {
      thinking: {
        type: "enabled",
        budgetTokens: 10000,
      },
    },
  },
  "claude-sonnet-4-6": {
    anthropic: {
      thinking: {
        type: "enabled",
        budgetTokens: 10000,
      },
    },
  },
  "claude-3-7-sonnet": {
    anthropic: {
      thinking: {
        type: "enabled",
        budgetTokens: 10000,
      },
    },
  },
};

export const anthropicProvider: AIProvider = {
  name: "Anthropic",
  provider: "anthropic",
  getModel(modelId: string, apiKey: string): LanguageModel {
    const anthropic = createAnthropic({ apiKey });
    return anthropic(modelId);
  },
  getProviderOptions(modelId: string): ProviderOptions | undefined {
    return ANTHROPIC_PROVIDER_OPTIONS[modelId];
  },
};
