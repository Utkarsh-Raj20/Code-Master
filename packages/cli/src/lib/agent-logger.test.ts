import { describe, expect, test, afterEach } from "bun:test";
import { AgentLogger } from "./agent-logger";
import fs from "node:fs";

describe("AgentLogger", () => {
  test("creates structured log entries and rotates", () => {
    const logger = AgentLogger.forRequest("test-session-123", "deepseek-v4-pro", "BUILD");

    logger.incomingMessages([
      { id: "m1", role: "user", parts: [{ type: "text", text: "hello world" }] },
    ]);

    logger.modelMessages([
      { role: "user", content: [{ type: "text", text: "hello world" }] },
    ]);

    logger.finish("ok");

    const logPath = AgentLogger.currentLogPath();
    expect(fs.existsSync(logPath)).toBe(true);

    const entries = AgentLogger.getRecentEntries(5);
    expect(entries.length).toBeGreaterThan(0);

    const finishEntry = entries.find((e) => e.event === "finish");
    expect(finishEntry).toBeDefined();
    expect(finishEntry?.sessionId).toBe("test-session-123");
  });

  test("records and retrieves provider errors", () => {
    const logger = AgentLogger.forRequest("test-session-456", "deepseek-v4-pro", "BUILD");
    logger.providerError(new Error("No tool call found for tool output with call_id call_00_xyz"));

    const lastErr = AgentLogger.getLastError();
    expect(lastErr).toContain("No tool call found for tool output");
  });
});

