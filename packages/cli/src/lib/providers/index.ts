import type { LanguageModel } from "ai";
import type { ProviderOptions } from "@ai-sdk/provider-utils";
import {
  findSupportedChatModel,
  type SupportedProvider,
} from "@mastercode/shared";

import { anthropicProvider } from "./anthropic.ts";
import { openaiProvider } from "./openai.ts";
import { geminiProvider } from "./gemini.ts";
import { groqProvider } from "./groq.ts";
import { openrouterProvider } from "./openrouter.ts";
import { deepseekProvider } from "./deepseek.ts";

export interface AIProvider {
  name: string;
  provider: SupportedProvider;
  getModel(modelId: string, apiKey: string): LanguageModel;
  getProviderOptions?(modelId: string): ProviderOptions | undefined;
}

const providers: Record<SupportedProvider, AIProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  groq: groqProvider,
  openrouter: openrouterProvider,
  deepseek: deepseekProvider,
};

export function getProvider(provider: SupportedProvider): AIProvider {
  const p = providers[provider];
  if (!p) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return p;
}

export type ResolvedModel = {
  model: LanguageModel;
  provider: SupportedProvider;
  modelId: string;
  providerOptions?: ProviderOptions;
};

export function getEnvironmentApiKey(provider: SupportedProvider): string | undefined {
  switch (provider) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "gemini":
      return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    case "groq":
      return process.env.GROQ_API_KEY;
    case "openrouter":
      return process.env.OPENROUTER_API_KEY;
    case "deepseek":
      return process.env.DEEPSEEK_API_KEY;
  }
}

export function resolveChatModel(params: {
  modelId: string;
  apiKey?: string;
  providerOverride?: SupportedProvider;
}): ResolvedModel {
  const modelDef = findSupportedChatModel(params.modelId);
  const provider = params.providerOverride ?? modelDef?.provider;

  if (!provider) {
    throw new Error(`Cannot determine provider for model: ${params.modelId}`);
  }

  const effectiveApiKey = params.apiKey || getEnvironmentApiKey(provider);
  if (!effectiveApiKey) {
    throw new Error(
      `No API key configured for provider '${provider}'. Please add your API key in CLI via /keys.`
    );
  }

  const aiProvider = getProvider(provider);
  const model = aiProvider.getModel(params.modelId, effectiveApiKey);
  const providerOptions = aiProvider.getProviderOptions?.(params.modelId);

  return {
    model,
    provider,
    modelId: params.modelId,
    providerOptions,
  };
}

export function isSupportedChatModel(modelId: string): boolean {
  return findSupportedChatModel(modelId) != null;
}
