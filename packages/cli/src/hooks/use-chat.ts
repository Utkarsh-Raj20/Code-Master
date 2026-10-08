import { useMemo } from "react";
import { useChat as useAiChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type InferUITools,
  lastAssistantMessageIsCompleteWithToolCalls,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import {
  findSupportedChatModel,
  type ModeType,
  type SupportedChatModelId,
  type ToolContracts,
} from "@mastercode/shared";
import { apiClient } from "../lib/api-client";
import { executeLocalTool } from "../lib/local-tools";
import { getActiveProvider, getKey } from "../lib/key-store";
import { localAgent } from "../lib/local-agent";

export type ChatMessageMetadata = {
  mode?: ModeType;
  model?: SupportedChatModelId | string;
  durationMs?: number;
  usage?: LanguageModelUsage;
  fallbackNotice?: string;
  pipelineNotice?: string;
};

type ChatTools = {
  [Name in keyof InferUITools<ToolContracts>]: {
    input: InferUITools<ToolContracts>[Name]["input"];
    output: unknown;
  };
};

export type Message = UIMessage<ChatMessageMetadata, never, ChatTools>;

export function useChat(sessionId: string, initialMessages: Message[], optimizePrompt: boolean = false) {
  const transport = useMemo(() => {
    return new DefaultChatTransport<Message>({
      api: apiClient.chat.$url().toString(),
      fetch: ((input, init) => localAgent.fetch(new Request(input.toString(), init))) as typeof fetch,
      headers() {
        const headers: Record<string, string> = {};

        const activeProvider = getActiveProvider();
        if (activeProvider) {
          const key = getKey(activeProvider);
          if (key) {
            headers["X-Provider"] = activeProvider;
            headers["X-Api-Key"] = key;
          }
        }

        return headers;
      },
      prepareSendMessagesRequest({ messages }) {
        const message = messages[messages.length - 1];
        if (!message) throw new Error("No message to send");

        const metadata = messages.findLast(
          (m) => m.metadata?.mode && m.metadata?.model,
        )?.metadata;
        const previousMessage = messages[messages.length - 2];
        const requestMessages =
          message.role === "assistant" && previousMessage?.role === "user"
            ? [previousMessage, message]
            : [message];

        const modelId = (message.metadata?.model ?? metadata?.model) as string | undefined;
        const modelDef = modelId ? findSupportedChatModel(modelId) : undefined;
        const provider = modelDef?.provider ?? getActiveProvider();
        const key = provider ? getKey(provider) : null;

        const headers: Record<string, string> = {};

        if (provider && key) {
          headers["X-Provider"] = provider;
          headers["X-Api-Key"] = key;
        }

        return {
          body: {
            id: sessionId,
            messages: requestMessages,
            mode: message.metadata?.mode ?? metadata?.mode,
            model: message.metadata?.model ?? metadata?.model,
          },
          headers: {
            ...headers,
            ...(optimizePrompt ? { "X-Optimize-Prompt": "1" } : {}),
          },
        };
      },
    });
  }, [sessionId, optimizePrompt]);

  const chat = useAiChat<Message>({
    id: sessionId,
    messages: initialMessages,
    transport,
    onToolCall({ toolCall }) {
      const mode = chat.messages.at(-1)?.metadata?.mode ?? "BUILD";

      void executeLocalTool(toolCall.toolName, toolCall.input, mode)
        .then((output) =>
          chat.addToolOutput({
            tool: toolCall.toolName as keyof ChatTools,
            toolCallId: toolCall.toolCallId,
            output,
          }),
        )
        .catch((error) =>
          chat.addToolOutput({
            tool: toolCall.toolName as keyof ChatTools,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: error instanceof Error ? error.message : String(error),
          }),
        );
    },
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  return {
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
    submit: (params: { userText: string; mode: ModeType; model: SupportedChatModelId }) => {
      return chat.sendMessage({
        text: params.userText,
        metadata: {
          mode: params.mode,
          model: params.model,
        },
      })
    },
    abort: chat.stop,
    interrupt: chat.stop,
  };
};
