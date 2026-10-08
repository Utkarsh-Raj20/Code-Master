import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { AIProvider } from "./index";

export const groqProvider: AIProvider = {
  name: "Groq",
  provider: "groq",
  getModel(modelId: string, apiKey: string): LanguageModel {
    const groq = createOpenAI({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey,
    });
    return groq(modelId);
  },
};
