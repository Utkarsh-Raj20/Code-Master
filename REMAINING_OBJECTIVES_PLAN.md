# Nightcode: Implementation Plan for Remaining Core Objectives

> **Target Goal:** Complete the pending components of **Feature 02 (Hierarchical Context Engine)** and **Feature 04 (MCP SSE Transport)** so all 4 core selling features are 100% operational and match the presentation slide.  
> **Runtime Stack:** Bun v1.1+, TypeScript v5.5+ AST API, `@modelcontextprotocol/sdk`, Vercel AI SDK v6, OpenTUI.

---

## 1. Scope & Objective Matrix

| Selling Feature | Sub-Component | Current Status | Required Implementation |
|---|---|:---:|---|
| **Feature 04: MCP Servers** | **SSE Remote Transport** | ❌ Missing | Add `SSEClientTransport` support in `mcp-manager.ts` alongside `StdioClientTransport`. |
| **Feature 02: Hierarchical Context** | **AST Topology Mapping** | ❌ Missing | Build `ast-indexer.ts` using `typescript` AST API to map symbols, exports, and import dependencies. |
| **Feature 02: Hierarchical Context** | **Rolling Memory** | ❌ Missing | Build `rolling-memory.ts` to compress early session turns when history exceeds token thresholds. |
| **Feature 02: Hierarchical Context** | **Cross-Provider Caching** | ❌ Missing | Implement prompt cache breakpoints (`cacheControl: { type: "ephemeral" }`) and cache token cost tracking. |

---

## 2. Detailed Technical Specifications

### Phase 1: MCP Remote SSE Transport (`mcp-manager.ts`)

#### 1.1 Configuration Schema Extension
Extend `McpServerConfig` to support both local subprocess (`command` + `args`) and remote SSE endpoints (`url` + `headers`):
```typescript
export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;                       // Remote SSE endpoint, e.g. "https://api.my-mcp.com/sse"
  headers?: Record<string, string>;   // Authorization: "Bearer ..."
}
```

#### 1.2 Transport Selection & Lifecycle
In `mcp-manager.ts`:
- If `config.url` is present:
  ```typescript
  import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

  const transport = new SSEClientTransport(new URL(config.url), {
    requestInit: {
      headers: config.headers ?? {},
    },
  });
  ```
- If `config.command` is present:
  ```typescript
  const transport = new StdioClientTransport({ ... });
  ```
- Tool listing, schema translation, error handling, and `callTool` remain identical across transports.

---

### Phase 2: AST Topology Mapping (`ast-indexer.ts`)

#### 2.1 Symbol & Dependency Extraction
Use the native TypeScript Compiler API (`ts.createSourceFile`) to parse source files (`.ts`, `.tsx`, `.js`, `.jsx`) without executing code:
- **Exported Symbols:** functions, classes, interfaces, types, constants.
- **Import Graph (Dependencies):** extract `import ... from "./path"` to build an adjacency graph of file relationships (`A imports B`).
- **Topology Tree Output:**
  ```typescript
  export interface FileTopology {
    filePath: string;
    exports: string[];
    imports: string[];
  }

  export interface ProjectTopology {
    files: Map<string, FileTopology>;
    dependencyGraph: Record<string, string[]>; // filePath -> imported filePaths
  }
  ```

#### 2.2 Progressive Disclosure & Tool Exposure
1. **Dynamic Tool `symbolTopology`**:
   Register in `packages/shared/src/schemas.ts` and `local-tools.ts`:
   - `input: { symbol?: string; file?: string }`
   - Returns where a symbol is defined, what files import it, and related exports.
2. **Compact System Prompt Injection**:
   Inject a high-level symbol index into the system prompt:
   ```xml
   <project_ast_topology>
     - packages/cli/src/lib/checkpoint-manager.ts -> exports [CheckpointManager]
     - packages/cli/src/lib/mcp-manager.ts -> exports [McpManager]
   </project_ast_topology>
   ```

---

### Phase 3: Rolling Memory Engine (`rolling-memory.ts`)

#### 3.1 Sliding Window with Recursive Compression
Currently, all messages in a session are accumulated indefinitely. When a session reaches 20+ turns, prompt tokens explode and cost/latency skyrockets.

**The Rolling Memory Algorithm:**
1. **Threshold Check:** When session turns > `MAX_RECENT_TURNS` (e.g. 10 turns) OR estimated tokens > `12,000`:
2. **Partitioning:**
   - **Recent Window (Last 6 turns):** Kept verbatim to preserve immediate conversational context and active tool calls.
   - **Older History (Turns 0 to N-6):** Extracted and distilled into a structured `<conversation_context_summary>`.
3. **Summary Structure:**
   ```markdown
   <conversation_context_summary>
   - Objectives Achieved: Implemented MCP stdio manager, added /undo command.
   - Files Modified: packages/cli/src/lib/mcp-manager.ts, packages/cli/src/components/status-bar.tsx.
   - Active Constraints: Zero server deployment, all OpenTUI strings inside <text>.
   </conversation_context_summary>
   ```
4. **Integration:** Placed in `local-agent.ts` before `convertToModelMessages()`.

---

### Phase 4: Cross-Provider Caching (`context-cache.ts`)

#### 4.1 Anthropic Prompt Cache Breakpoints
Anthropic supports 90% cache read discounts and 4x speedups when `cacheControl` is set on static blocks:
- In `local-agent.ts`, when the active provider is `anthropic`:
  - Set `experimental_providerMetadata: { anthropic: { cacheControl: { type: "ephemeral" } } }` on:
    1. The core system prompt & guidelines.
    2. The project instructions (`<projectname>.md`).
    3. The tool definitions.

#### 4.2 Deterministic Prefix Ordering (OpenAI / DeepSeek / Gemini)
For providers with automatic KV-prefix caching:
- Ensure the prompt prefix (System Prompt + Project Instructions + AST Topology) is strictly deterministic and ordered identically on every turn.

#### 4.3 Cache Telemetry in `CostTracker`
Extend `cost-tracker.ts` to track:
- `cacheReadTokens`: charged at 10% of input rate ($0.30 / 1M for Claude 3.5 Sonnet).
- `cacheWriteTokens`: charged at 125% of input rate ($3.75 / 1M for Claude 3.5 Sonnet).
- Surfaces in `/cost` toast: `Tokens: 14k (8k cached, 90% saved) | Cost: $0.02`.

---

## 3. Phased Execution Order

```
[Phase 1: MCP SSE Remote Transport]
  ├── Task 1.1: Update McpServerConfig schema in mcp-manager.ts
  ├── Task 1.2: Add SSEClientTransport connection logic
  └── Task 1.3: Update mcp-manager.test.ts to test SSE config & error handling

[Phase 2: AST Topology Indexer]
  ├── Task 2.1: Create packages/cli/src/lib/ast-indexer.ts using ts.createSourceFile
  ├── Task 2.2: Add symbolTopology tool in packages/shared/src/schemas.ts
  ├── Task 2.3: Route symbolTopology tool in packages/cli/src/lib/local-tools.ts
  └── Task 2.4: Create packages/cli/src/lib/ast-indexer.test.ts

[Phase 3: Rolling Memory Engine]
  ├── Task 3.1: Create packages/cli/src/lib/rolling-memory.ts
  ├── Task 3.2: Wire rolling compression into local-agent.ts before model conversion
  └── Task 3.3: Create packages/cli/src/lib/rolling-memory.test.ts

[Phase 4: Cross-Provider Caching & Telemetry]
  ├── Task 4.1: Inject Anthropic cacheControl metadata into local-agent.ts
  ├── Task 4.2: Update CostTracker pricing math to support cached token rates
  └── Task 4.3: Update cost-tracker.test.ts

[Phase 5: Full Automated Verification]
  └── Run bun test (verify all 12 test suites passing)
```

---

## 4. Verification & Success Criteria

1. **MCP SSE:** Any `.mcp.json` containing `"url": "https://..."` connects via `SSEClientTransport` without crashing.
2. **AST Topology:** `ast-indexer.ts` parses a TypeScript project in < 100ms, extracting symbol lists and file import graphs.
3. **Rolling Memory:** A simulated 30-turn session compresses older turns while keeping recent turns intact.
4. **Caching:** Anthropic requests attach `cacheControl`, and `CostTracker` records cache read/write breakdowns.
5. **Tests:** All existing 37 tests + new test suites pass with 0 failures under `bun test`.

