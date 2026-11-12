import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { jsonSchema, tool, type Tool } from "ai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type?: "http" | "sse" | "stdio";
  headers?: Record<string, string>;
}

export interface McpServerEntry {
  serverName: string;
  config: McpServerConfig;
  source: string;
}

export interface McpServerStatus {
  name: string;
  status: "connected" | "failed";
  toolCount: number;
  transportType: "stdio" | "http" | "sse";
}

interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema: unknown;
}

interface McpCallResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

interface ConnectedServer {
  client: Client;
  transport: StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport;
  tools: McpToolDescriptor[];
  transportType: "stdio" | "http" | "sse";
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

export function namespaceTool(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName}`;
}

export function parseNamespacedTool(
  namespacedName: string,
): { serverName: string; toolName: string } | null {
  if (!namespacedName.startsWith("mcp__")) return null;
  const rest = namespacedName.slice("mcp__".length);
  const sep = rest.indexOf("__");
  if (sep <= 0) return null;
  const serverName = rest.slice(0, sep);
  const toolName = rest.slice(sep + 2);
  if (!serverName || !toolName) return null;
  return { serverName, toolName };
}

/**
 * Parse a `.mcp.json` / Claude Desktop config JSON string into server entries.
 * Supports both stdio (command + args) and remote HTTP/SSE (url + headers) endpoints.
 * Returns an empty array for malformed or empty input.
 */
export function parseMcpConfig(raw: string): { serverName: string; config: McpServerConfig }[] {
  let parsed: unknown;
  try {
    const cleanRaw = raw.replace(/^\uFEFF/, "");
    parsed = JSON.parse(cleanRaw);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object") return [];
  const root = parsed as Record<string, unknown>;

  // Check top-level mcpServers or nested project blocks in .claude.json
  let servers = root.mcpServers;
  if (!servers || typeof servers !== "object") {
    // In .claude.json, check if current directory or first project block has mcpServers
    for (const val of Object.values(root)) {
      if (val && typeof val === "object" && "mcpServers" in val && typeof (val as any).mcpServers === "object") {
        servers = (val as any).mcpServers;
        break;
      }
    }
  }

  if (!servers || typeof servers !== "object") return [];

  const entries: { serverName: string; config: McpServerConfig }[] = [];
  for (const [name, rawConfig] of Object.entries(servers as Record<string, unknown>)) {
    if (!rawConfig || typeof rawConfig !== "object") continue;
    const cfg = rawConfig as Record<string, unknown>;

    // Case 1: Remote HTTP or SSE endpoint
    const urlStr = typeof cfg.url === "string" ? cfg.url : typeof cfg.endpoint === "string" ? cfg.endpoint : undefined;
    if (urlStr && urlStr.trim()) {
      const headers =
        cfg.headers && typeof cfg.headers === "object"
          ? (cfg.headers as Record<string, string>)
          : undefined;
      const type = cfg.type === "sse" ? "sse" : "http";
      entries.push({ serverName: name, config: { url: urlStr.trim(), headers, type } });
      continue;
    }

    // Case 2: Local Stdio subprocess
    if (typeof cfg.command === "string" && cfg.command.trim()) {
      const args = Array.isArray(cfg.args)
        ? cfg.args.filter((a): a is string => typeof a === "string")
        : undefined;
      const env =
        cfg.env && typeof cfg.env === "object"
          ? (cfg.env as Record<string, string>)
          : undefined;
      entries.push({ serverName: name, config: { command: cfg.command, args, env, type: "stdio" } });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// McpManager
// ---------------------------------------------------------------------------

export class McpManager {
  private static connections = new Map<string, ConnectedServer>();
  private static statuses = new Map<string, McpServerStatus>();
  private static initialized = false;

  /**
   * Discover MCP server configs from project and global config files.
   */
  static loadConfigs(
    cwd: string = process.cwd(),
    homeDir: string = os.homedir(),
  ): McpServerEntry[] {
    const files: { filePath: string }[] = [
      { filePath: path.join(cwd, ".mcp.json") },
      { filePath: path.join(homeDir, ".mastercode", "mcp.json") },
      { filePath: path.join(homeDir, ".claude.json") },
      { filePath: path.join(homeDir, ".claude", "claude_desktop_config.json") },
    ];

    const entries: McpServerEntry[] = [];
    for (const { filePath } of files) {
      if (!fs.existsSync(filePath)) continue;
      try {
        const raw = fs.readFileSync(filePath, "utf8");
        for (const entry of parseMcpConfig(raw)) {
          // Avoid duplicate servers if configured in both local and global
          if (!entries.some((e) => e.serverName === entry.serverName)) {
            entries.push({ ...entry, source: filePath });
          }
        }
      } catch {
        // Skip unreadable / malformed config files.
      }
    }
    return entries;
  }

  private static buildEnv(extra?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") env[key] = value;
    }
    if (extra) Object.assign(env, extra);
    return env;
  }

  private static async connectServer(name: string, config: McpServerConfig): Promise<void> {
    const transportType: "stdio" | "http" | "sse" = config.url
      ? config.type === "sse"
        ? "sse"
        : "http"
      : "stdio";

    try {
      let transport: StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport;

      const client = new Client(
        { name: "nightcode", version: "1.0.0" },
        { capabilities: {} },
      );

      if (config.url) {
        if (config.type === "sse") {
          transport = new SSEClientTransport(new URL(config.url), {
            requestInit: { headers: config.headers ?? {} },
          });
          await client.connect(transport);
        } else {
          // Default to modern Streamable HTTP with fallback to SSE
          try {
            transport = new StreamableHTTPClientTransport(new URL(config.url), {
              requestInit: { headers: config.headers ?? {} },
            });
            await client.connect(transport);
          } catch (httpErr) {
            transport = new SSEClientTransport(new URL(config.url), {
              requestInit: { headers: config.headers ?? {} },
            });
            await client.connect(transport);
          }
        }
      } else if (config.command) {
        let cmd = config.command;
        if (
          process.platform === "win32" &&
          (cmd === "npx" || cmd === "npm" || cmd === "bunx") &&
          !cmd.endsWith(".cmd") &&
          !cmd.endsWith(".exe")
        ) {
          cmd = `${cmd}.cmd`;
        }

        transport = new StdioClientTransport({
          command: cmd,
          args: config.args ?? [],
          env: this.buildEnv(config.env),
        });
        await client.connect(transport);
      } else {
        throw new Error("Invalid MCP configuration: neither 'command' nor 'url' was provided");
      }

      const listResult = await client.listTools();
      const tools: McpToolDescriptor[] = (listResult?.tools ?? []).map((t) => ({
        name: (t as { name: string }).name,
        description: (t as { description?: string }).description,
        inputSchema: (t as { inputSchema?: unknown }).inputSchema,
      }));

      this.connections.set(name, { client, transport, tools, transportType });
      this.statuses.set(name, {
        name,
        status: "connected",
        toolCount: tools.length,
        transportType,
      });
    } catch (error) {
      this.statuses.set(name, {
        name,
        status: "failed",
        toolCount: 0,
        transportType,
      });
      console.warn(
        `[mcp] Failed to connect to '${name}' via ${transportType}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Spawn and connect all configured MCP servers.
   */
  static async init(configs?: McpServerEntry[], force = false): Promise<void> {
    if (this.initialized && !force && this.connections.size > 0) return;
    this.initialized = true;

    const entries = configs ?? this.loadConfigs();
    for (const entry of entries) {
      if (!this.connections.has(entry.serverName)) {
        await this.connectServer(entry.serverName, entry.config);
      }
    }
  }

  /**
   * Refresh all MCP server connections, discovering any new config changes.
   */
  static async refresh(): Promise<McpServerStatus[]> {
    this.initialized = false;
    await this.init(undefined, true);
    return this.getServerStatuses();
  }

  /**
   * Convert all connected MCP tools into AI SDK tool contracts, namespaced as
   * `mcp__<server>__<tool>` to avoid collisions with built-in tools.
   */
  static async getAiSdkTools(): Promise<Record<string, Tool<any, any>>> {
    const result: Record<string, Tool<any, any>> = {};

    for (const [serverName, connection] of this.connections) {
      for (const mcpTool of connection.tools) {
        const namespaced = namespaceTool(serverName, mcpTool.name);
        try {
          result[namespaced] = tool({
            description:
              mcpTool.description ??
              `MCP tool '${mcpTool.name}' from server '${serverName}'`,
            inputSchema: jsonSchema((mcpTool.inputSchema ?? { type: "object" }) as any),
          });
        } catch {
          // Skip tools whose schema cannot be converted.
        }
      }
    }

    return result;
  }

  private static serializeResult(result: McpCallResult): unknown {
    const text = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    if (text) return text;
    return result.content;
  }

  /**
   * Execute an MCP tool given its namespaced name (`mcp__<server>__<tool>`).
   */
  static async executeTool(namespacedName: string, args: unknown): Promise<unknown> {
    const parsed = parseNamespacedTool(namespacedName);
    if (!parsed) {
      throw new Error(`Invalid MCP tool name: '${namespacedName}'`);
    }

    const connection = this.connections.get(parsed.serverName);
    if (!connection) {
      throw new Error(`MCP server '${parsed.serverName}' is not connected`);
    }

    const result = (await connection.client.callTool({
      name: parsed.toolName,
      arguments: (args ?? {}) as Record<string, unknown>,
    })) as unknown as McpCallResult;

    if (result.isError) {
      throw new Error(String(this.serializeResult(result) ?? "MCP tool call failed"));
    }

    return this.serializeResult(result);
  }

  static getServerStatuses(): McpServerStatus[] {
    return Array.from(this.statuses.values());
  }

  static async closeAll(): Promise<void> {
    for (const connection of this.connections.values()) {
      try {
        await connection.client.close();
      } catch {
        // best-effort cleanup
      }
    }
    this.connections.clear();
    this.statuses.clear();
    this.initialized = false;
  }

  /**
   * Synchronously reset in-memory state (used by tests).
   */
  static reset(): void {
    this.connections.clear();
    this.statuses.clear();
    this.initialized = false;
  }
}
