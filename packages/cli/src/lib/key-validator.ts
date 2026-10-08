import type { SupportedProvider } from "@mastercode/shared";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  models?: string[];
}

export async function validateKey(
  provider: SupportedProvider,
  key: string
): Promise<ValidationResult> {
  const trimmedKey = key.trim();
  if (!trimmedKey) {
    return { valid: false, error: "API key cannot be empty" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    switch (provider) {
      case "anthropic": {
        const response = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": trimmedKey,
            "anthropic-version": "2023-06-01",
          },
          signal: controller.signal,
        });

        if (response.ok) {
          const data = (await response.json()) as { data?: Array<{ id: string }> };
          const models = data.data?.map((m) => m.id);
          return { valid: true, models };
        }

        if (response.status === 401) {
          return { valid: false, error: "Invalid Anthropic API key" };
        }

        const errData = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        return {
          valid: false,
          error: errData.error?.message ?? `Anthropic validation failed (${response.status})`,
        };
      }

      case "openai": {
        const response = await fetch("https://api.openai.com/v1/models", {
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
          },
          signal: controller.signal,
        });

        if (response.ok) {
          const data = (await response.json()) as { data?: Array<{ id: string }> };
          const models = data.data?.map((m) => m.id);
          return { valid: true, models };
        }

        if (response.status === 401) {
          return { valid: false, error: "Invalid OpenAI API key" };
        }

        const errData = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        return {
          valid: false,
          error: errData.error?.message ?? `OpenAI validation failed (${response.status})`,
        };
      }

      case "gemini": {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`,
          { signal: controller.signal }
        );

        if (response.ok) {
          const data = (await response.json()) as { models?: Array<{ name: string }> };
          const models = data.models?.map((m) => m.name);
          return { valid: true, models };
        }

        if (response.status === 400 || response.status === 403) {
          return { valid: false, error: "Invalid Google Gemini API key" };
        }

        const errData = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        return {
          valid: false,
          error: errData.error?.message ?? `Gemini validation failed (${response.status})`,
        };
      }

      case "groq": {
        const response = await fetch("https://api.groq.com/openai/v1/models", {
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
          },
          signal: controller.signal,
        });

        if (response.ok) {
          const data = (await response.json()) as { data?: Array<{ id: string }> };
          const models = data.data?.map((m) => m.id);
          return { valid: true, models };
        }

        if (response.status === 401) {
          return { valid: false, error: "Invalid Groq API key" };
        }

        const errData = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        return {
          valid: false,
          error: errData.error?.message ?? `Groq validation failed (${response.status})`,
        };
      }

      case "openrouter": {
        const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
          },
          signal: controller.signal,
        });

        if (response.ok) {
          return { valid: true };
        }

        if (response.status === 401) {
          return { valid: false, error: "Invalid OpenRouter API key" };
        }

        const errData = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        return {
          valid: false,
          error: errData.error?.message ?? `OpenRouter validation failed (${response.status})`,
        };
      }

      case "deepseek": {
        const response = await fetch("https://api.deepseek.com/models", {
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
          },
          signal: controller.signal,
        });

        if (response.ok) {
          const data = (await response.json()) as { data?: Array<{ id: string }> };
          const models = data.data?.map((m) => m.id);
          return { valid: true, models };
        }

        if (response.status === 401) {
          return { valid: false, error: "Invalid DeepSeek API key" };
        }

        const errData = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        return {
          valid: false,
          error: errData.error?.message ?? `DeepSeek validation failed (${response.status})`,
        };
      }

      default:
        return { valid: true };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { valid: false, error: "Validation timed out after 10 seconds" };
    }
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Validation network request failed",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
