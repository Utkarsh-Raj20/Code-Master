import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { AIProvider } from "./index";

export const openrouterProvider: AIProvider = {
  name: "OpenRouter",
  provider: "openrouter",
  getModel(modelId: string, apiKey: string): LanguageModel {
    const openrouter = createOpenAI({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      headers: {
        "HTTP-Referer": "https://github.com/mastercode/mastercode",
        "X-Title": "Mastercode",
      },
    });
    // Strip openrouter/ prefix if present
    const normalizedModelId = modelId.startsWith("openrouter/")
      ? modelId.replace(/^openrouter\//, "")
      : modelId;
    return openrouter(normalizedModelId);
  },
};
