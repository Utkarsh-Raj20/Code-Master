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
import {
  createSession,
  getSession,
  listSessions,
  listSessionsByCwd,
  updateSessionMessages,
  type Session,
} from "./session-store";


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
  const tools = getToolContracts(mode);

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

  const nextMessages = await validateUIMessages<mastercodeUIMessage>({
    messages: mergedMessages,
    tools,
  });

  // ---------------------------------------------------------------------------
  // Stage 1 & 2: Prompt pipeline (hook + rewriter)
  // ---------------------------------------------------------------------------
  let pipelineNotice: string | undefined;
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
      }
      if (pipelineResult.hookExecuted) {
        pipelineNotice = pipelineNotice
          ? pipelineNotice + " · hook executed"
          : "🔗 Hook executed";
      }
    }
  }

  // Re-validate after potential pipeline rewrite
  const validatedMessages = await validateUIMessages<mastercodeUIMessage>({
    messages: mergedMessages,
    tools,
  });
  const modelMessages = await convertToModelMessages(validatedMessages, { tools });
  let completedUsage: LanguageModelUsage | null = null;

  // Resolve config file name for XML tagging in system prompt
  const configFilePath = getProjectConfigPath();
  const configFileName = configFilePath ? path.basename(configFilePath) : undefined;

  let result;
  try {
    result = streamText({
      model: resolvedModel.model,
      system: buildSystemPrompt({ mode, projectConfig: findProjectConfig() ?? undefined, configFileName }),
      messages: modelMessages,
      tools,
      providerOptions: resolvedModel.providerOptions,
      onFinish(event) {
        completedUsage = event.totalUsage;
      },
      onError(error) {
        return error instanceof Error ? error.message : String(error);
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

          result = streamText({
            model: resolvedModel.model,
            system: buildSystemPrompt({ mode, projectConfig: findProjectConfig() ?? undefined, configFileName }),
            messages: modelMessages,
            tools,
            providerOptions: resolvedModel.providerOptions,
            onFinish(event) {
              completedUsage = event.totalUsage;
            },
            onError(err) {
              return err instanceof Error ? err.message : String(err);
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
      };
    },
    async onFinish(event) {
      if (event.isAborted) return;
      if (hasPendingToolCalls(event.responseMessage)) return;

      updateSessionMessages(id, event.messages);
    },
    onError(error) {
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
