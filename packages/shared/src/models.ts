export type ModelPricing = {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
};

export type SupportedProvider =
  | "anthropic"
  | "openai"
  | "gemini"
  | "groq"
  | "openrouter"
  | "deepseek";

export interface ProviderInfo {
  id: SupportedProvider;
  name: string;
  keyPrefix?: string;
  placeholder?: string;
  docsUrl: string;
}

export const PROVIDER_INFO: Record<SupportedProvider, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    keyPrefix: "sk-ant-",
    placeholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    keyPrefix: "sk-",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    keyPrefix: "AIza",
    placeholder: "AIza...",
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  groq: {
    id: "groq",
    name: "Groq",
    keyPrefix: "gsk_",
    placeholder: "gsk_...",
    docsUrl: "https://console.groq.com/keys",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    keyPrefix: "sk-or-",
    placeholder: "sk-or-...",
    docsUrl: "https://openrouter.ai/keys",
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    keyPrefix: "sk-",
    placeholder: "sk-...",
    docsUrl: "https://platform.deepseek.com/api_keys",
  },
};

type SupportedChatModelDefinition = {
  id: string;
  provider: SupportedProvider;
  pricing?: ModelPricing;
};

export const SUPPORTED_CHAT_MODELS = [
  // Anthropic
  {
    id: "claude-3-7-sonnet",
    provider: "anthropic",
  },
  {
    id: "claude-3-5-sonnet",
    provider: "anthropic",
  },
  {
    id: "claude-3-5-haiku",
    provider: "anthropic",
  },
  {
    id: "claude-3-opus",
    provider: "anthropic",
  },
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
  },
  {
    id: "claude-opus-4-6",
    provider: "anthropic",
  },
  // OpenAI
  {
    id: "gpt-4o",
    provider: "openai",
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
  },
  {
    id: "gpt-4-turbo",
    provider: "openai",
  },
  {
    id: "gpt-3.5-turbo",
    provider: "openai",
  },
  {
    id: "gpt-5.4",
    provider: "openai",
  },
  {
    id: "gpt-5.4-mini",
    provider: "openai",
  },
  {
    id: "gpt-5.4-nano",
    provider: "openai",
  },
  // Google Gemini
  {
    id: "gemini-2.0-flash",
    provider: "gemini",
  },
  {
    id: "gemini-1.5-pro",
    provider: "gemini",
  },
  {
    id: "gemini-1.5-flash",
    provider: "gemini",
  },
  // Groq
  {
    id: "llama-3.3-70b-versatile",
    provider: "groq",
  },
  {
    id: "llama-3.1-8b-instant",
    provider: "groq",
  },
  {
    id: "mixtral-8x7b-32768",
    provider: "groq",
  },
  // OpenRouter
  {
    id: "anthropic/claude-3.5-sonnet",
    provider: "openrouter",
  },
  {
    id: "openai/gpt-4o",
    provider: "openrouter",
  },
  {
    id: "google/gemini-2.0-flash-001",
    provider: "openrouter",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    provider: "openrouter",
  },
  // DeepSeek
  {
    id: "deepseek-chat",
    provider: "deepseek",
  },
  {
    id: "deepseek-reasoner",
    provider: "deepseek",
  },
  {
    id: "deepseek-v4-pro",
    provider: "deepseek",
  },
] as const satisfies readonly SupportedChatModelDefinition[];

export type SupportedChatModel = (typeof SUPPORTED_CHAT_MODELS)[number];
export type SupportedChatModelId = SupportedChatModel["id"];

export function findSupportedChatModel(modelId: string): SupportedChatModel | undefined {
  return SUPPORTED_CHAT_MODELS.find((model) => model.id === modelId);
}

export function getModelsForProvider(provider: SupportedProvider): SupportedChatModel[] {
  return SUPPORTED_CHAT_MODELS.filter((model) => model.provider === provider);
}

export const DEFAULT_CHAT_MODEL_ID: SupportedChatModelId = "claude-3-5-sonnet";

