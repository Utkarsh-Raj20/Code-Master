/**
 * Rolling Memory Engine
 *
 * Implements sliding-window conversation compression to prevent context-window
 * overflow and degrade in long-running agentic sessions.
 *
 * When session turns exceed a threshold, older turns are distilled into a
 * structured `<rolling_conversation_memory>` block while the most recent
 * turns are preserved verbatim.
 */

export interface RollingMemoryOptions {
  maxRecentMessages?: number; // default: 8 (4 user + 4 assistant turns)
  tokenThreshold?: number;    // default: 12_000
}

export interface CompressedHistoryResult<T = any> {
  messages: T[];
  compressedCount: number;
  wasCompressed: boolean;
  summaryBlock?: string;
}

function extractTextFromMessage(message: any): string {
  if (!message) return "";
  if (typeof message === "string") return message;

  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.parts)) {
    return message.parts
      .map((p: any) => {
        if (typeof p.text === "string") return p.text;
        if (p.type === "dynamic-tool" || (typeof p.type === "string" && p.type.startsWith("tool-"))) {
          const toolName = p.toolName ?? p.type.replace(/^tool-/, "");
          return `[Tool: ${toolName}]`;
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

function extractKeyFacts(messages: any[]): {
  userGoals: string[];
  toolsUsed: Set<string>;
  filesTouched: Set<string>;
} {
  const userGoals: string[] = [];
  const toolsUsed = new Set<string>();
  const filesTouched = new Set<string>();

  for (const msg of messages) {
    if (msg.role === "user") {
      const text = extractTextFromMessage(msg).trim();
      if (text && !text.startsWith("<rolling_conversation_memory>")) {
        // truncate long user inputs
        const shortGoal = text.length > 100 ? `${text.slice(0, 97)}...` : text;
        userGoals.push(shortGoal);
      }
    }

    if (Array.isArray(msg.parts)) {
      for (const part of msg.parts) {
        if (part.type === "dynamic-tool" || (typeof part.type === "string" && part.type.startsWith("tool-"))) {
          const toolName = part.toolName ?? part.type.replace(/^tool-/, "");
          toolsUsed.add(toolName);

          const input = part.input as Record<string, any> | undefined;
          if (input && typeof input.path === "string") {
            filesTouched.add(input.path);
          }
        }
      }
    }
  }

  return { userGoals, toolsUsed, filesTouched };
}

/**
 * Generate a concise context summary from older messages.
 */
export function buildMemorySummaryBlock(olderMessages: any[]): string {
  const { userGoals, toolsUsed, filesTouched } = extractKeyFacts(olderMessages);

  const lines: string[] = [
    "<rolling_conversation_memory>",
    "### Compressed Conversation History",
    `The following ${olderMessages.length} earlier turns were distilled to preserve context:`,
  ];

  if (userGoals.length > 0) {
    lines.push("#### Prior User Requests:");
    for (const goal of userGoals.slice(-5)) {
      lines.push(`- ${goal}`);
    }
  }

  if (filesTouched.size > 0) {
    lines.push("#### Files Inspected / Modified:");
    for (const file of Array.from(filesTouched).slice(-10)) {
      lines.push(`- ${file}`);
    }
  }

  if (toolsUsed.size > 0) {
    lines.push(`#### Tools Invoked: ${Array.from(toolsUsed).join(", ")}`);
  }

  lines.push("</rolling_conversation_memory>");
  return lines.join("\n");
}

/**
 * Compresses message history using a sliding window.
 */
export function compressMessageHistory<T extends { role?: string; id?: string; parts?: any[] }>(
  messages: T[],
  options?: RollingMemoryOptions,
): CompressedHistoryResult<T> {
  const maxRecent = options?.maxRecentMessages ?? 8;

  if (messages.length <= maxRecent) {
    return {
      messages,
      compressedCount: 0,
      wasCompressed: false,
    };
  }

  const splitIndex = messages.length - maxRecent;
  const olderMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  const summaryText = buildMemorySummaryBlock(olderMessages);

  // Construct a synthetic summary message at the head of the recent window
  const summaryMessage: any = {
    id: `summary-${Date.now()}`,
    role: "user",
    parts: [
      {
        type: "text",
        text: summaryText,
      },
    ],
  };

  return {
    messages: [summaryMessage, ...recentMessages] as T[],
    compressedCount: olderMessages.length,
    wasCompressed: true,
    summaryBlock: summaryText,
  };
}

