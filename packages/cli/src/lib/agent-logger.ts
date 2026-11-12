/**
 * agent-logger.ts
 *
 * Lightweight structured logger for the local agent chat pipeline.
 * Writes JSON-Lines to ~/.mastercode/logs/agent-YYYY-MM-DD.jsonl
 * Each line is a self-contained JSON object so you can `grep` / `jq` it.
 *
 * Usage:
 *   const log = AgentLogger.forRequest(sessionId, model, mode);
 *   log.incomingMessages(messages);
 *   log.mergedMessages(mergedMessages);
 *   log.modelMessages(modelMessages);
 *   log.providerError(error);
 *   log.validationError(error);
 *   log.finish("ok" | "error");
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_LOG_FILES = 7; // keep one week
let resolvedLogDir: string | null = null;

function getLogDir(): string {
  if (resolvedLogDir) return resolvedLogDir;
  const globalDir = path.join(os.homedir(), ".mastercode", "logs");
  try {
    if (!fs.existsSync(globalDir)) {
      fs.mkdirSync(globalDir, { recursive: true });
    }
    resolvedLogDir = globalDir;
    return resolvedLogDir;
  } catch {
    const localDir = path.join(process.cwd(), ".mastercode", "logs");
    try {
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
    } catch { /* non-fatal */ }
    resolvedLogDir = localDir;
    return resolvedLogDir;
  }
}

function getLogFilePath(): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(getLogDir(), `agent-${date}.jsonl`);
}

// ---------------------------------------------------------------------------
// Low-level write (sync, non-throwing)
// ---------------------------------------------------------------------------

function ensureLogDir() {
  getLogDir();
}

function rotateLogs() {
  try {
    const dir = getLogDir();
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("agent-") && f.endsWith(".jsonl"))
      .sort()
      .reverse();
    for (const old of files.slice(MAX_LOG_FILES)) {
      fs.unlinkSync(path.join(dir, old));
    }
  } catch { /* non-fatal */ }
}

function writeEntry(entry: Record<string, unknown>) {
  try {
    ensureLogDir();
    const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + "\n";
    fs.appendFileSync(getLogFilePath(), line, "utf8");
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Message summary helpers (avoid logging huge payloads verbatim)
// ---------------------------------------------------------------------------

function summariseParts(parts: unknown[]): unknown[] {
  return parts.map((p) => {
    const part = p as Record<string, unknown>;
    if (typeof part !== "object" || part === null) return p;
    // For tool parts, show key fields only
    if (typeof part.type === "string" && (part.type.startsWith("tool-") || part.type === "dynamic-tool")) {
      return {
        type: part.type,
        toolCallId: part.toolCallId,
        toolName: (part as Record<string, unknown>).toolName,
        state: part.state,
        hasOutput: part.output !== undefined && part.output !== null,
        hasError: typeof part.errorText === "string",
        inputKeys: part.input && typeof part.input === "object"
          ? Object.keys(part.input as object)
          : undefined,
      };
    }
    if (part.type === "text" || part.type === "reasoning") {
      return { type: part.type, state: part.state, length: typeof part.text === "string" ? part.text.length : 0 };
    }
    return { type: part.type };
  });
}

function summariseUIMessages(msgs: unknown[]): unknown[] {
  return (msgs as Array<Record<string, unknown>>).map((m) => ({
    id: m.id,
    role: m.role,
    parts: Array.isArray(m.parts) ? summariseParts(m.parts) : m.parts,
  }));
}

function summariseModelMessages(msgs: unknown[]): unknown[] {
  return (msgs as Array<Record<string, unknown>>).map((m) => {
    const role = m.role;
    if (role === "assistant") {
      const content = Array.isArray(m.content) ? m.content : [];
      return {
        role,
        content: content.map((c: Record<string, unknown>) => ({
          type: c.type,
          ...(c.type === "tool-call" ? { toolCallId: c.toolCallId, toolName: c.toolName } : {}),
          ...(c.type === "text" ? { length: typeof c.text === "string" ? c.text.length : 0 } : {}),
        })),
      };
    }
    if (role === "tool") {
      const content = Array.isArray(m.content) ? m.content : [];
      return {
        role,
        content: content.map((c: Record<string, unknown>) => ({
          type: c.type,
          toolCallId: c.toolCallId,
          toolName: c.toolName,
        })),
      };
    }
    if (role === "user") {
      const content = Array.isArray(m.content) ? m.content : (typeof m.content === "string" ? m.content : []);
      return {
        role,
        contentTypes: Array.isArray(content)
          ? content.map((c: Record<string, unknown>) => c.type)
          : typeof content === "string" ? ["text"] : [],
      };
    }
    return { role };
  });
}

function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 6).join("\n"),
    };
  }
  return { raw: String(error) };
}

// ---------------------------------------------------------------------------
// RequestLogger
// ---------------------------------------------------------------------------

export class RequestLogger {
  private readonly reqId: string;
  private readonly sessionId: string;
  private readonly model: string;
  private readonly mode: string;
  private readonly startMs: number;

  constructor(sessionId: string, model: string, mode: string) {
    this.reqId = Math.random().toString(36).slice(2, 10);
    this.sessionId = sessionId;
    this.model = model;
    this.mode = mode;
    this.startMs = Date.now();
    rotateLogs();
  }

  private write(event: string, payload: Record<string, unknown>) {
    writeEntry({
      event,
      reqId: this.reqId,
      sessionId: this.sessionId,
      model: this.model,
      mode: this.mode,
      elapsedMs: Date.now() - this.startMs,
      ...payload,
    });
  }

  /** Raw messages from the client request body */
  incomingMessages(messages: unknown[]) {
    this.write("incoming_messages", {
      count: messages.length,
      messages: summariseUIMessages(messages),
    });
  }

  /** Session messages loaded from disk */
  sessionMessages(messages: unknown[]) {
    this.write("session_messages", {
      count: messages.length,
      messages: summariseUIMessages(messages),
    });
  }

  /** Merged result of session + incoming (before pipeline) */
  mergedMessages(messages: unknown[]) {
    this.write("merged_messages", {
      count: messages.length,
      messages: summariseUIMessages(messages),
    });
  }

  /** Model messages produced by convertToModelMessages (sent to provider) */
  modelMessages(messages: unknown[]) {
    this.write("model_messages", {
      count: messages.length,
      messages: summariseModelMessages(messages),
    });
  }

  /** Error thrown or returned by validateUIMessages */
  validationError(error: unknown) {
    this.write("validation_error", { error: formatError(error) });
  }

  /**
   * Error received from the AI provider (e.g. DeepSeek's
   * "No tool call found for tool output" response).
   */
  providerError(error: unknown) {
    this.write("provider_error", { error: formatError(error) });
  }

  /** Generic pipeline error (fallback router, prompt rewriter, etc.) */
  pipelineError(stage: string, error: unknown) {
    this.write("pipeline_error", { stage, error: formatError(error) });
  }

  /** Logged when the stream finishes (success or error) */
  finish(outcome: "ok" | "error", extra?: Record<string, unknown>) {
    this.write("finish", { outcome, ...extra });
  }
}

// ---------------------------------------------------------------------------
// Singleton convenience
// ---------------------------------------------------------------------------

export const AgentLogger = {
  forRequest(sessionId: string, model: string, mode: string): RequestLogger {
    return new RequestLogger(sessionId, model, mode);
  },

  /** Path to today's log file */
  currentLogPath(): string {
    return getLogFilePath();
  },

  /** Read recent log entries (up to `limit`, newest first) */
  getRecentEntries(limit: number = 10): Array<Record<string, unknown>> {
    try {
      const filePath = getLogFilePath();
      if (!fs.existsSync(filePath)) return [];
      const lines = fs
        .readFileSync(filePath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean);
      return lines
        .slice(-limit)
        .reverse()
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return { raw: line };
          }
        });
    } catch {
      return [];
    }
  },

  /** Find the most recent error logged today */
  getLastError(): string | null {
    try {
      const entries = this.getRecentEntries(50);
      for (const entry of entries) {
        if (entry.event === "provider_error" || entry.event === "validation_error" || entry.event === "pipeline_error") {
          const err = entry.error as Record<string, unknown> | undefined;
          return (err?.message as string) || (err?.raw as string) || (entry.event as string);
        }
      }
      return null;
    } catch {
      return null;
    }
  },
};
