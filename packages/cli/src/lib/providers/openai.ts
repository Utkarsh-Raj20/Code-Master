import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { AIProvider } from "./index";

const OPENAI_PROVIDER_OPTIONS: Record<string, ProviderOptions> = {
  "gpt-5.4": {
    openai: {
      thinking: {
        reasoningSummary: "detailed",
      },
    },
  },
};

export const openaiProvider: AIProvider = {
  name: "OpenAI",
  provider: "openai",
  getModel(modelId: string, apiKey: string): LanguageModel {
    const openai = createOpenAI({ apiKey });
    return openai(modelId);
  },
  getProviderOptions(modelId: string): ProviderOptions | undefined {
    return OPENAI_PROVIDER_OPTIONS[modelId];
  },
};
