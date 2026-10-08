import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import type { AIProvider } from "./index";

export const geminiProvider: AIProvider = {
  name: "Google Gemini",
  provider: "gemini",
  getModel(modelId: string, apiKey: string): LanguageModel {
    const google = createGoogleGenerativeAI({ apiKey });
    return google(modelId) as unknown as LanguageModel;
  },
};
