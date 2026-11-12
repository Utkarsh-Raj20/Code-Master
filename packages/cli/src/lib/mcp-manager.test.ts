import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  McpManager,
  namespaceTool,
  parseNamespacedTool,
} from "./mcp-manager";

let tempDir: string;

beforeEach(() => {
  McpManager.reset();
  tempDir = mkdtempSync(join(tmpdir(), "mcp-"));
});

afterEach(async () => {
  await McpManager.closeAll();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("McpManager", () => {
  test("loadConfigs correctly parses both stdio and SSE .mcp.json structure", () => {
    const config = {
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_TOKEN: "token-123" },
        },
        remoteSse: {
          url: "https://mcp.example.com/sse",
          headers: { Authorization: "Bearer test-key" },
        },
        broken: { foo: "bar" },
      },
    };
    writeFileSync(join(tempDir, ".mcp.json"), JSON.stringify(config), "utf-8");

    const entries = McpManager.loadConfigs(tempDir, join(tempDir, "home"));

    expect(entries).toHaveLength(2);

    const stdioEntry = entries.find((e) => e.serverName === "github");
    expect(stdioEntry).toBeDefined();
    expect(stdioEntry!.config.command).toBe("npx");
    expect(stdioEntry!.config.args).toEqual(["-y", "@modelcontextprotocol/server-github"]);
    expect(stdioEntry!.config.env).toEqual({ GITHUB_TOKEN: "token-123" });

    const sseEntry = entries.find((e) => e.serverName === "remoteSse");
    expect(sseEntry).toBeDefined();
    expect(sseEntry!.config.url).toBe("https://mcp.example.com/sse");
    expect(sseEntry!.config.headers).toEqual({ Authorization: "Bearer test-key" });
  });

  test("namespaces tools as mcp__<server>__<tool>", () => {
    expect(namespaceTool("github", "create_issue")).toBe("mcp__github__create_issue");
    expect(parseNamespacedTool("mcp__github__create_issue")).toEqual({
      serverName: "github",
      toolName: "create_issue",
    });
    expect(parseNamespacedTool("readFile")).toBeNull();
    expect(parseNamespacedTool("mcp__broken")).toBeNull();
  });

  test("handles unreachable/failing server commands without throwing", async () => {
    await expect(
      McpManager.init([
        {
          serverName: "bad-server",
          config: { command: "definitely-not-a-real-command-xyz" },
          source: "test",
        },
      ]),
    ).resolves.toBeUndefined();
  });

  test("handles unreachable SSE endpoints without throwing", async () => {
    await expect(
      McpManager.init([
        {
          serverName: "bad-sse",
          config: { url: "http://127.0.0.1:59999/nonexistent-sse", type: "sse" },
          source: "test",
        },
      ]),
    ).resolves.toBeUndefined();

    const statuses = McpManager.getServerStatuses();
    const sseStatus = statuses.find((s) => s.name === "bad-sse");
    expect(sseStatus).toBeDefined();
    expect(sseStatus!.status).toBe("failed");
    expect(sseStatus!.transportType).toBe("sse");
  });

  test("getServerStatuses reports server state accurately", async () => {
    await McpManager.init([
      {
        serverName: "bad-server",
        config: { command: "definitely-not-a-real-command-xyz" },
        source: "test",
      },
    ]);

    expect(McpManager.getServerStatuses()).toEqual([
      { name: "bad-server", status: "failed", toolCount: 0, transportType: "stdio" },
    ]);
  });
});
