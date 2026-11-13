import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  convertToModelMessages,
  streamText,
  validateUIMessages,
  type InferUITools,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import {
  getToolContracts,
  modeSchema,
  type ModeType,
  type ToolContracts,
  type SupportedProvider,
} from "@mastercode/shared";

import { buildSystemPrompt } from "./system-prompt";
import { resolveChatModel, isSupportedChatModel } from "./providers";
import { findProjectConfig, getProjectConfigPath } from "./project-config";
import path from "node:path";
import { runInit } from "./init-project";
import {
  isRecoverableError,
  getNextFallbackModel,
  createFallbackNotice,
} from "./fallback-router";
import { runPromptPipeline } from "./prompt-pipeline";
import { CostTracker } from "./cost-tracker";
import { SkillManager } from "./skill-manager";
import { McpManager } from "./mcp-manager";
import { compressMessageHistory } from "./rolling-memory";
import {
  createSession,
  getSession,
  listSessions,
  listSessionsByCwd,
  updateSessionMessages,
  type Session,
} from "./session-store";
import { AgentLogger } from "./agent-logger";


// ---------------------------------------------------------------------------
// Types & Schemas
// ---------------------------------------------------------------------------

type ChatMessageMetadata = {
  mode?: ModeType;
  model?: string;
  durationMs?: number;
  usage?: LanguageModelUsage;
  fallbackNotice?: string;
  pipelineNotice?: string;
  promptOptimization?: {
    original: string;
    optimized: string;
  };
};

type mastercodeUIMessage = UIMessage<ChatMessageMetadata, never, InferUITools<ToolContracts>>;

const createSessionSchema = z.object({
  title: z.string(),
});

const submitChatSchema = z.object({
  id: z.string(),
  messages: z
    .array(
      z.custom<mastercodeUIMessage>((value) => {
        return value != null && typeof value === "object" && "id" in value && "parts" in value;
      }),
    )
    .min(1),
  mode: modeSchema,
  model: z.string().refine(isSupportedChatModel, "Unsupported model"),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasPendingToolCalls(message: mastercodeUIMessage) {
  return message.parts.some((part) => {
    if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
      const state = (part as { state?: string }).state;
      return state !== "output-available" && state !== "output-error";
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

const sessionsApp = new Hono()
  .get("/", async (c) => {
    // ?project=1 → only sessions from the current CWD
    const projectOnly = c.req.query("project") === "1";
    const sessions = projectOnly ? listSessionsByCwd() : listSessions();
    return c.json(sessions);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const session = getSession(id);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json(session);
  })
  .post("/", zValidator("json", createSessionSchema), async (c) => {
    const data = c.req.valid("json");
    const session = createSession(data.title);
    return c.json(session, 201);
  });

const chatApp = new Hono().post("/", zValidator("json", submitChatSchema), async (c) => {
  const { id, messages, mode, model } = c.req.valid("json");

  const providerHeader = c.req.header("X-Provider") as SupportedProvider | undefined;
  const apiKeyHeader = c.req.header("X-Api-Key");
  const optimizePrompt = c.req.header("X-Optimize-Prompt") === "1";

  const session = getSession(id);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const startTime = Date.now();
  const logger = AgentLogger.forRequest(id, model, mode);
  logger.incomingMessages(messages);
  const tools = getToolContracts(mode);

  // Load skills catalog for progressive disclosure into the system prompt
  SkillManager.loadSkills();
  const skillsCatalog = SkillManager.getCatalogSummary();

  let activeModel = model;
  let resolvedModel;
  let fallbackNotice: string | null = null;

  try {
    resolvedModel = resolveChatModel({
      modelId: activeModel,
      apiKey: apiKeyHeader,
      providerOverride: providerHeader,
    });
  } catch (error) {
    const fallback = getNextFallbackModel(activeModel, providerHeader);
    if (fallback) {
      try {
        resolvedModel = resolveChatModel({
          modelId: fallback.modelId,
          apiKey: fallback.apiKey,
          providerOverride: fallback.provider,
        });
        fallbackNotice = createFallbackNotice(
          activeModel,
          fallback.modelId,
          error instanceof Error ? error.message : "Provider unconfigured",
        );
        activeModel = fallback.modelId;
      } catch {
        const message = error instanceof Error ? error.message : "Failed to initialize AI model";
        return c.json({ error: message }, 400);
      }
    } else {
      const message = error instanceof Error ? error.message : "Failed to initialize AI model";
      return c.json({ error: message }, 400);
    }
  }

  const previousMessages = Array.isArray(session.messages)
    ? (session.messages as unknown as mastercodeUIMessage[])
    : [];
  logger.sessionMessages(previousMessages);
  const mergedMessages = [...previousMessages];

  for (const message of messages) {
    const incomingMessage = {
      ...message,
      metadata: { ...message.metadata, mode, model: activeModel },
    } satisfies mastercodeUIMessage;

    const existingMessageIndex = mergedMessages.findIndex((m) => m.id === incomingMessage.id);

    if (existingMessageIndex === -1) {
      mergedMessages.push(incomingMessage);
    } else {
      mergedMessages[existingMessageIndex] = incomingMessage;
    }
  }

  logger.mergedMessages(mergedMessages);

  try {
    await validateUIMessages<mastercodeUIMessage>({
      messages: mergedMessages,
      tools,
    });
  } catch (err) {
    logger.validationError(err);
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Stage 1 & 2: Prompt pipeline (hook + rewriter)
  // ---------------------------------------------------------------------------
  let pipelineNotice: string | undefined;
  let promptOptimization: { original: string; optimized: string } | undefined;
  if (optimizePrompt || true /* hooks always run */) {
    // Find the last user text message
    const lastUserMsg = [...mergedMessages].reverse().find((m) => m.role === "user");
    const lastUserText = lastUserMsg?.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join(" ")
      .trim();

    if (lastUserText) {
      const pipelineResult = await runPromptPipeline({
        rawInput: lastUserText,
        projectRoot: process.cwd(),
        mode,
        model: activeModel as any,
        provider: (resolvedModel.provider as SupportedProvider) ?? "anthropic",
        apiKey: apiKeyHeader,
        optimizePrompt,
      });

      if (pipelineResult.wasRewritten && lastUserMsg) {
        // Replace the last user message parts with the rewritten prompt
        const idx = mergedMessages.findIndex((m) => m.id === lastUserMsg.id);
        if (idx !== -1) {
          mergedMessages[idx] = {
            ...lastUserMsg,
            parts: [{ type: "text", text: pipelineResult.finalPrompt }],
          } as mastercodeUIMessage;
        }
        pipelineNotice = "✨ Prompt optimized";
        promptOptimization = {
          original: lastUserText,
          optimized: pipelineResult.finalPrompt,
        };
      }
      if (pipelineResult.hookExecuted) {
        pipelineNotice = pipelineNotice
          ? pipelineNotice + " · hook executed"
          : "🔗 Hook executed";
      }
    }
  }

  // Apply rolling memory compression if session history is large
  const memoryResult = compressMessageHistory(mergedMessages);

  // Re-validate after potential pipeline rewrite and compression
  let validatedMessages: mastercodeUIMessage[];
  try {
    validatedMessages = await validateUIMessages<mastercodeUIMessage>({
      messages: memoryResult.messages,
      tools,
    });
  } catch (err) {
    logger.validationError(err);
    throw err;
  }
  const modelMessages = await convertToModelMessages(validatedMessages, { tools });
  logger.modelMessages(modelMessages);
  let completedUsage: LanguageModelUsage | null = null;

  // Resolve config file name for XML tagging in system prompt
  const configFilePath = getProjectConfigPath();
  const configFileName = configFilePath ? path.basename(configFilePath) : undefined;

  // Merge MCP dynamic tools into the toolset (namespaced mcp__<server>__<tool>)
  await McpManager.init();
  const mcpTools = await McpManager.getAiSdkTools();
  const combinedTools = { ...(tools as Record<string, any>), ...mcpTools };

  const systemPrompt = buildSystemPrompt({ mode, projectConfig: findProjectConfig() ?? undefined, configFileName, skillsCatalog });

  // ---------------------------------------------------------------------------
  // Anthropic prompt cache breakpoints
  //
  // Wrapping the static system prompt with cacheControl: { type: "ephemeral" }
  // tells Anthropic to cache the prefix up to that point. Subsequent turns that
  // share the same static prefix get a 90% discount on cached input tokens.
  // ---------------------------------------------------------------------------
  const isAnthropic = (resolvedModel.provider as string) === "anthropic";
  const anthropicCacheOptions = isAnthropic
    ? {
        anthropic: {
          cacheControl: { type: "ephemeral" },
        },
      }
    : undefined;

  // Merge cache options on top of any existing provider options (e.g. thinking)
  const mergedProviderOptions = anthropicCacheOptions
    ? {
        ...resolvedModel.providerOptions,
        ...anthropicCacheOptions,
      }
    : resolvedModel.providerOptions;

  let result;
  try {
    result = streamText({
      model: resolvedModel.model,
      system: systemPrompt,
      messages: modelMessages,
      tools: combinedTools,
      providerOptions: mergedProviderOptions,
      onFinish(event) {
        completedUsage = event.totalUsage;
        if (event.totalUsage) {
          const usageAny = event.totalUsage as any;
          const promptTokens =
            event.totalUsage.inputTokens ??
            usageAny.promptTokens ??
            0;
          const completionTokens =
            event.totalUsage.outputTokens ??
            usageAny.completionTokens ??
            0;
          const cachedTokens =
            event.totalUsage.inputTokenDetails?.cacheReadTokens ??
            usageAny.cacheReadInputTokens ??
            usageAny.cachedPromptTokens ??
            usageAny.cachedTokens ??
            0;
          const cacheWriteTokens =
            event.totalUsage.inputTokenDetails?.cacheWriteTokens ??
            usageAny.cacheCreationInputTokens ??
            0;
          CostTracker.recordUsage(activeModel, {
            promptTokens,
            completionTokens,
            cachedTokens,
            cacheWriteTokens,
          });
        }
      },
      onError(event) {
        logger.providerError(event.error);
      },
    });
  } catch (error) {
    if (isRecoverableError(error)) {
      const fallback = getNextFallbackModel(activeModel, resolvedModel.provider);
      if (fallback) {
        try {
          resolvedModel = resolveChatModel({
            modelId: fallback.modelId,
            apiKey: fallback.apiKey,
            providerOverride: fallback.provider,
          });
          fallbackNotice = createFallbackNotice(
            activeModel,
            fallback.modelId,
            error instanceof Error ? error.message : "Service error",
          );
          activeModel = fallback.modelId;

          // Recompute provider options for the fallback model (may differ in provider)
          const isFallbackAnthropic = (resolvedModel.provider as string) === "anthropic";
          const fallbackCacheOptions = isFallbackAnthropic
            ? { anthropic: { cacheControl: { type: "ephemeral" } } }
            : undefined;
          const fallbackProviderOptions = fallbackCacheOptions
            ? { ...resolvedModel.providerOptions, ...fallbackCacheOptions }
            : resolvedModel.providerOptions;

          result = streamText({
            model: resolvedModel.model,
            system: systemPrompt,
            messages: modelMessages,
            tools: combinedTools,
            providerOptions: fallbackProviderOptions,
            onFinish(event) {
              completedUsage = event.totalUsage;
              if (event.totalUsage) {
                const usageAny = event.totalUsage as any;
                const promptTokens =
                  event.totalUsage.inputTokens ??
                  usageAny.promptTokens ??
                  0;
                const completionTokens =
                  event.totalUsage.outputTokens ??
                  usageAny.completionTokens ??
                  0;
                const cachedTokens =
                  event.totalUsage.inputTokenDetails?.cacheReadTokens ??
                  usageAny.cacheReadInputTokens ??
                  usageAny.cachedPromptTokens ??
                  usageAny.cachedTokens ??
                  0;
                const cacheWriteTokens =
                  event.totalUsage.inputTokenDetails?.cacheWriteTokens ??
                  usageAny.cacheCreationInputTokens ??
                  0;
                CostTracker.recordUsage(activeModel, {
                  promptTokens,
                  completionTokens,
                  cachedTokens,
                  cacheWriteTokens,
                });
              }
            },
            onError(event) {
              logger.providerError(event.error);
            },
          });
        } catch {
          throw error;
        }
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  return result.toUIMessageStreamResponse<mastercodeUIMessage>({
    originalMessages: validatedMessages,
    messageMetadata({ part }) {
      if (part.type === "start") {
        return {
          mode,
          model: activeModel,
          ...(fallbackNotice ? { fallbackNotice } : {}),
          ...(pipelineNotice ? { pipelineNotice } : {}),
          ...(promptOptimization ? { promptOptimization } : {}),
        };
      }

      if (part.type !== "finish") return undefined;

      return {
        mode,
        model: activeModel,
        durationMs: Date.now() - startTime,
        ...(completedUsage ? { usage: completedUsage } : {}),
        ...(fallbackNotice ? { fallbackNotice } : {}),
        ...(pipelineNotice ? { pipelineNotice } : {}),
        ...(promptOptimization ? { promptOptimization } : {}),
      };
    },
    async onFinish(event) {
      if (event.isAborted) {
        logger.finish("error", { reason: "aborted" });
        return;
      }
      if (hasPendingToolCalls(event.responseMessage)) {
        logger.finish("ok", { pendingTools: true });
        return;
      }

      logger.finish("ok", { messageCount: event.messages.length });
      updateSessionMessages(id, event.messages);
    },
    onError(error) {
      logger.providerError(error);
      logger.finish("error", { error: String(error) });
      return error instanceof Error ? error.message : String(error);
    },
  });
});

// ---------------------------------------------------------------------------
// /init route
// ---------------------------------------------------------------------------

const initSchema = z.object({
  model: z.string().refine(isSupportedChatModel, "Unsupported model"),
});

const initApp = new Hono().post("/", zValidator("json", initSchema), async (c) => {
  const { model } = c.req.valid("json");
  const result = await runInit(model);
  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }
  return c.json({ filePath: result.filePath, existed: result.existed });
});

// ---------------------------------------------------------------------------
// App assembly
// ---------------------------------------------------------------------------

const app = new Hono();

app.onError((error, c) => {
  console.error("In-process agent error", error);
  return c.json({ error: error.message || "Internal error" }, 500);
});

const routes = app
  .route("/sessions", sessionsApp)
  .route("/chat", chatApp)
  .route("/init", initApp);

// Re-export type for hc() generic typing
export type AppType = typeof routes;

// Export the fetch handler for the custom api-client
export const localAgent = {
  fetch: app.fetch,
};
