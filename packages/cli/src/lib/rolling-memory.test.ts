import { describe, expect, test } from "bun:test";
import {
  buildMemorySummaryBlock,
  compressMessageHistory,
} from "./rolling-memory";

describe("RollingMemory", () => {
  test("does not compress history when turn count is below threshold", () => {
    const messages = [
      { id: "1", role: "user", parts: [{ type: "text", text: "hello" }] },
      { id: "2", role: "assistant", parts: [{ type: "text", text: "hi there" }] },
    ];

    const result = compressMessageHistory(messages, { maxRecentMessages: 6 });

    expect(result.wasCompressed).toBe(false);
    expect(result.compressedCount).toBe(0);
    expect(result.messages).toHaveLength(2);
  });

  test("compresses older messages and preserves recent window verbatim", () => {
    const messages: any[] = [];
    for (let i = 1; i <= 12; i++) {
      messages.push({
        id: `msg-${i}`,
        role: i % 2 === 1 ? "user" : "assistant",
        parts: [{ type: "text", text: `turn ${i}` }],
      });
    }

    const result = compressMessageHistory(messages, { maxRecentMessages: 4 });

    expect(result.wasCompressed).toBe(true);
    expect(result.compressedCount).toBe(8); // 12 - 4 = 8 compressed
    expect(result.messages).toHaveLength(5); // 1 summary + 4 recent

    // First message should be the summary
    const summaryMsg = result.messages[0]!;
    expect(summaryMsg.parts[0].text).toContain("<rolling_conversation_memory>");

    // Last 4 messages should match the end of the original list
    expect(result.messages[1]!.id).toBe("msg-9");
    expect(result.messages[4]!.id).toBe("msg-12");
  });

  test("buildMemorySummaryBlock captures goals, modified files, and tools", () => {
    const olderMessages: any[] = [
      {
        id: "1",
        role: "user",
        parts: [{ type: "text", text: "Create database schema" }],
      },
      {
        id: "2",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "writeFile",
            input: { path: "schema.prisma" },
          },
        ],
      },
      {
        id: "3",
        role: "user",
        parts: [{ type: "text", text: "Run migration" }],
      },
      {
        id: "4",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "bash",
            input: { command: "prisma migrate" },
          },
        ],
      },
    ];

    const summary = buildMemorySummaryBlock(olderMessages);

    expect(summary).toContain("<rolling_conversation_memory>");
    expect(summary).toContain("Create database schema");
    expect(summary).toContain("Run migration");
    expect(summary).toContain("schema.prisma");
    expect(summary).toContain("writeFile");
    expect(summary).toContain("bash");
    expect(summary).toContain("</rolling_conversation_memory>");
  });
});

