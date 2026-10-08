import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { AIProvider } from "./index";

export const deepseekProvider: AIProvider = {
  name: "DeepSeek",
  provider: "deepseek",
  getModel(modelId: string, apiKey: string): LanguageModel {
    const deepseek = createOpenAI({
      name: "deepseek",
      baseURL: "https://api.deepseek.com",
      apiKey,
    });
    return deepseek(modelId);
  },
};
