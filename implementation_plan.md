# Architectural & Feature Enhancements: Beyond Claude Code

This implementation plan outlines the roadmap to elevate MasterCode/NightCode beyond Claude Code's capabilities. It focuses on multi-model resilience, self-healing diagnostic loops, fine-grained undo/checkpoints, interactive terminal UX with OpenTUI, and a zero-trust permission engine.

---

## User Review Required

> [!IMPORTANT]
> - **Zero Server Architecture**: All improvements will be implemented entirely within `@mastercode/cli` and `@mastercode/shared` as local, client-side modules.
> - **Test Suite**: We will introduce `bun:test` suites across `packages/cli` and `packages/shared`.
> - **Backward Compatibility**: Existing commands, session stores, and key storage will remain intact and fully functional.

---

## Proposed Features & Implementation Breakdown

```
MasterCode CLI Core
│
├── 1. Diagnostic Feedback Engine (Self-Healing Code)
│   ├── Post-edit linter & compiler hook (`local-tools.ts`)
│   └── Diagnostic error injector for LLM turns
│
├── 2. Multi-Model Cascade & Fallback Routing
│   ├── Auto-recovery on 429 (Rate Limit) / 503 (Outage)
│   └── Key-aware provider fallback hierarchy
│
├── 3. Session Checkpoint & Undo Engine (`/undo`)
│   ├── File snapshot transaction manager (`checkpoint-manager.ts`)
│   └── Rollback command integration
│
├── 4. OpenTUI Interactive Collapsible Tool Calls & Diffs
│   ├── Collapsible accordion container for tool runs
│   └── Rich diff formatter component
│
├── 5. Cost & Telemetry Analytics HUD
│   ├── Token & cost calculator (`cost-tracker.ts`)
│   └── Real-time status bar HUD
│
├── 6. Granular Permission & Safety Guard
│   ├── Tool rule evaluator (`permission-guard.ts`)
│   └── Interactive confirmation prompts
│
└── 7. Advanced Prompt Pipeline & Lifecycle Hooks
    ├── Hook & interceptor engine (`.mastercode/hooks/userPromptSubmit.ts`)
    ├── Fast LLM rewriter / meta-prompt engine (`prompt-rewriter.ts`)
    ├── Unified repository context injection (`<project_architecture_and_guidelines>`)
    └── Pipeline orchestrator (`prompt-pipeline.ts`) & `/optimize` toggle
```

---

### Task 1: Self-Healing Diagnostic & Linter Feedback Loop

#### Problem & Motivation
Claude Code often makes an edit, moves on, and only realizes syntax or type errors broke if the user explicitly tells it to run tests. By automatically checking TypeScript/lint diagnostics immediately after `writeFile` or `editFile`, we can catch type errors in real-time and feed them right back into the model's tool execution result so it self-corrects in the same turn.

#### Implementation Details
1. **Create [diagnostics.ts](file:///d:/projects/nightcode/packages/cli/src/lib/diagnostics.ts)**:
   - Detect project type (e.g., presence of `tsconfig.json` for TypeScript, `biome.json`, or `.eslintrc`).
   - Run lightweight target verification: `bun x tsc --noEmit` or `tsc --noEmit` filtered to modified files, with a strict timeout (e.g., 4000ms).
   - Return structured issues: `{ line, column, code, message }[]`.
2. **Modify [local-tools.ts](file:///d:/projects/nightcode/packages/cli/src/lib/local-tools.ts)**:
   - After successful `writeFile` or `editFile`, trigger `runDiagnostics(targetFile)`.
   - If diagnostic errors are found, append them to the tool response:
     ```json
     {
       "success": true,
       "path": "src/index.ts",
       "diagnostics": [
         "Type 'string' is not assignable to type 'number' at line 42"
       ],
       "hint": "Please review and fix the diagnostic errors reported above."
     }
     ```

#### Verification & Tests
- **Test File**: `packages/cli/src/lib/diagnostics.test.ts`
  - `should detect syntax and type errors on an invalid typescript file`
  - `should return empty diagnostics for valid typescript file`
  - `should gracefully handle non-typescript projects without hanging`

---

### Task 2: Multi-Model Cascade & Automatic Fallback Routing

#### Problem & Motivation
Claude Code is bound to Anthropic. If Anthropic hits a rate limit (HTTP 429), goes down (503), or exhausts tokens, the user is completely stuck. MasterCode supports 6 providers. When an active provider fails with rate-limit or network outage, MasterCode should seamlessly cascade to a configured fallback model or prompt the user to switch with a single keystroke.

#### Implementation Details
1. **Create [fallback-router.ts](file:///d:/projects/nightcode/packages/cli/src/lib/fallback-router.ts)**:
   - Define fallback order based on configured API keys in [key-store.ts](file:///d:/projects/nightcode/packages/cli/src/lib/key-store.ts) (e.g., Anthropic Claude 3.7 Sonnet $\rightarrow$ OpenAI GPT-4o $\rightarrow$ Gemini 2.0 Flash $\rightarrow$ DeepSeek Chat).
   - Detect recoverable errors (status 429, 500, 502, 503, 529).
2. **Modify [local-agent.ts](file:///d:/projects/nightcode/packages/cli/src/lib/local-agent.ts)**:
   - Wrap the model execution call in a retry/fallback handler.
   - If a provider triggers a recoverable error, log an informative system notice to the user stream and switch to the fallback provider transparently.

#### Verification & Tests
- **Test File**: `packages/cli/src/lib/fallback-router.test.ts`
  - `should identify retryable error codes (429, 503, 529)`
  - `should select the next available provider with a configured API key`
  - `should throw when no alternative provider has an API key configured`

---

### Task 3: Session Checkpoints & Undo Command (`/undo`)

#### Problem & Motivation
Claude Code has no atomic rewind mechanism. If an edit produces unwanted changes across multiple files, the user has to manually inspect git diffs and revert. A built-in transaction snapshot manager gives users an instant safety net.

#### Implementation Details
1. **Create [checkpoint-manager.ts](file:///d:/projects/nightcode/packages/cli/src/lib/checkpoint-manager.ts)**:
   - In-memory & scratch-disk shadow history: Before any `writeFile` or `editFile`, snapshot the original file content keyed by `{ stepId, filePath, content, timestamp }`.
   - Implement `createSnapshot(filePath: string): Promise<string>`
   - Implement `rollbackLastStep(): Promise<{ restoredFiles: string[] }>`
2. **Register `/undo` Command**:
   - Add `/undo` to [commands.tsx](file:///d:/projects/nightcode/packages/cli/src/components/command-menu/commands.tsx) and the chat command handler.
   - Revert modified files to their state before the last agent turn and notify the chat thread.

#### Verification & Tests
- **Test File**: `packages/cli/src/lib/checkpoint-manager.test.ts`
  - `should save snapshot before file modification`
  - `should restore exact original content when undoing a single file edit`
  - `should correctly handle restoring a newly created file (deleting it)`
  - `should support multiple sequential undo operations`

---

### Task 4: Interactive Collapsible Tool Views & Diffs in OpenTUI

#### Problem & Motivation
Claude Code prints tool executions as continuous streaming blocks, which quickly floods the terminal buffer with thousands of lines of file contents or bash logs. With OpenTUI, we can render tool calls in tidy collapsible blocks with clean visual status badges.

#### Implementation Details
1. **Create [tool-accordion.tsx](file:///d:/projects/nightcode/packages/cli/src/components/messages/tool-accordion.tsx)**:
   - Renders tool title, badge (`[DONE]`, `[RUNNING]`, `[ERROR]`), and duration.
   - Collapsed state displays 1 concise line: `▶ readFile (packages/cli/package.json) • 40 lines`
   - Expanded state reveals full content or diff with syntax coloring.
2. **Create [diff-viewer.tsx](file:///d:/projects/nightcode/packages/cli/src/components/messages/diff-viewer.tsx)**:
   - Formats `oldString` vs `newString` into Git-style colored hunks (`+` in green, `-` in red).
3. **Integrate into [bot-message.tsx](file:///d:/projects/nightcode/packages/cli/src/components/messages/bot-message.tsx)**:
   - Replace raw tool output text blocks with the interactive `ToolAccordion` component.

#### Verification & Tests
- **Test File**: `packages/cli/src/lib/diff-formatter.test.ts`
  - `should generate clean unified diff hunks from oldString and newString`
  - `should handle multiline additions and deletions accurately`

---

### Task 5: Real-Time Token & Cost Analytics HUD

#### Problem & Motivation
Developers are often blind to how much a session costs when using premium models (Claude 3.7 Sonnet, o3-mini). Providing real-time token tracking and estimated USD cost per turn and for the entire session brings complete cost transparency.

#### Implementation Details
1. **Create [cost-tracker.ts](file:///d:/projects/nightcode/packages/cli/src/lib/cost-tracker.ts)**:
   - Calculate cost using `inputTokens`, `outputTokens`, `cachedTokens` against `SUPPORTED_CHAT_MODELS` pricing tables.
   - Accumulate session-wide totals: `{ promptTokens, completionTokens, totalCostUsd }`.
2. **Update [status-bar.tsx](file:///d:/projects/nightcode/packages/cli/src/components/status-bar.tsx)**:
   - Render: `Tokens: 14.2k | Cost: $0.04 | Model: claude-3-5-sonnet`.
3. **Add `/cost` Command**:
   - Prints a breakdown table of token consumption and cost by model and by tool turn.

#### Verification & Tests
- **Test File**: `packages/cli/src/lib/cost-tracker.test.ts`
  - `should calculate exact cost for Anthropic Claude 3.5 Sonnet tokens`
  - `should calculate zero/correct cost for free/local/custom providers`
  - `should accumulate costs across multiple session turns`

---

### Task 6: Granular Permission & Safety Guard

#### Problem & Motivation
Claude Code requires either approving every command or running with `--dangerously-skip-permissions`. A rule-based engine offers safety without annoying the user for harmless operations.

#### Implementation Details
1. **Create [permission-guard.ts](file:///d:/projects/nightcode/packages/cli/src/lib/permission-guard.ts)**:
   - Auto-allow safe read-only tools: `readFile`, `listDirectory`, `glob`, `grep`.
   - Guard destructive file actions (e.g. overwriting files outside the workspace, touching `.env*`, `.git/*`).
   - Categorize bash commands:
     - *Safe*: `git status`, `git diff`, `bun test`, `npm test`, `ls`, `cat`.
     - *Dangerous*: `rm -rf`, `git push`, `git reset --hard`, `curl ... | sh`.
   - When a dangerous tool is called, trigger an interactive OpenTUI confirmation prompt: `Allow execution? (y/n/always)`.

#### Verification & Tests
- **Test File**: `packages/cli/src/lib/permission-guard.test.ts`
  - `should allow read-only tools without prompting`
  - `should flag destructive bash commands for user confirmation`
  - `should block unauthorized writes to protected files (.env)`

---

### Task 7: Advanced Prompt Rewriting, Lifecycle Hooks & Context Injection Pipeline

#### Problem & Motivation
Raw developer instructions provided to terminal coding agents often suffer from three major issues:
1. **Conversational Noise & Ambiguity**: Inputs like *"can you fix why the router is broken in the client"* contain filler words and lack explicit task scoping, causing frontier models to waste tokens on polite banter or misinterpret execution constraints.
2. **Missing Lifecycle Hooks**: Teams cannot enforce local project workflows (e.g., auto-injecting active Git branch names, staging server URLs, or corporate compliance constraints before a prompt is dispatched).
3. **Fragmented Project Context**: Guidelines living in files like `.mastercode.md`, `CLAUDE.md`, or `AGENT.md` need to be unified and wrapped in structured XML tags so the LLM strictly differentiates project rules from conversational messages.

To solve this, MasterCode will implement the **4-stage Prompt Execution Pipeline** described in `pormpt.md`, adapted to MasterCode's standalone Bun runtime, BYOK multi-model system, and OpenTUI interface:
```
[User Input] ──> [Hooks & Interceptors] ──> [Rewriter / Planner LLM] ──> [Context / File Injection] ──> [Main Core Agent LLM]
```

#### Implementation Details

1. **Lifecycle Hook & Interceptor Engine ([NEW] `packages/cli/src/lib/prompt-hooks.ts`)**:
   - Detects local project hook scripts at project root:
     - Primary: `.mastercode/hooks/userPromptSubmit.{ts,js}`
     - Fallback / Standard: `.config/hooks/userPromptSubmit.{ts,js}` or `.hooks/userPromptSubmit.{ts,js}`
   - Executed via native Bun dynamic `import()`.
   - Passes rich hook context: `{ projectRoot: string, mode: ModeType, model: SupportedChatModelId }`.
   - Enforces a 4,000ms safety timeout; catches runtime errors and falls back to raw user input with an informative warning so a faulty hook never blocks the developer.

2. **Multi-Model Meta-Prompting Rewriter ([NEW] `packages/cli/src/lib/prompt-rewriter.ts`)**:
   - Uses a fast, cost-effective model from the user's active provider (e.g., `claude-3-5-haiku` for Anthropic, `gpt-4o-mini` for OpenAI, `gemini-2.0-flash` for Gemini, or the active model).
   - Invokes `generateText` with the user's BYOK encrypted API keys from `key-store.ts`.
   - Runs a specialized meta-prompt that:
     - Strips conversational pleasantries and filler.
     - Detects the task archetype (`Build`, `Debug`, `Refactor`, `Review`, `Explore`).
     - Outputs clean, high-signal XML tags: `<task_type>`, `<objective>`, `<execution_guardrails>`.
   - If rewriting fails or no key is present for the fast model, gracefully passes through the user's prompt unhindered.

3. **Expanded Project Context Injection ([MODIFY] `packages/cli/src/lib/project-config.ts` & `system-prompt.ts`)**:
   - Updates `findProjectConfig` to discover guidelines from `.mastercode.md`, `CLAUDE.md`, and `AGENT.md` hierarchically up the directory tree.
   - Updates `buildSystemPrompt` to format injected project guidelines cleanly inside `<project_architecture_and_guidelines file="...">` XML blocks.

4. **Pipeline Orchestrator ([NEW] `packages/cli/src/lib/prompt-pipeline.ts`)**:
   - Coordinates the 4 steps:
     ```ts
     export async function runPromptPipeline(params: {
       rawInput: string;
       projectRoot: string;
       mode: ModeType;
       model: SupportedChatModelId;
       optimizePrompt: boolean;
     }): Promise<{
       finalPrompt: string;
       wasRewritten: boolean;
       hookExecuted: boolean;
     }>;
     ```
   - Integrated into `local-agent.ts` in the `POST /chat` endpoint before `streamText`.

5. **Interactive UI Toggle & Status Bar Indicator**:
   - Add `/optimize` (alias `/rewrite`) command in `commands.tsx` to toggle prompt rewriting on or off with toast notifications.
   - Add `optimizePrompt` state to `PromptConfigProvider`.
   - Show status in `status-bar.tsx`: `✨ opt:on` / `✨ opt:off`.

#### Verification & Tests
- **Test File**: `packages/cli/src/lib/prompt-pipeline.test.ts`
  - `should execute userPromptSubmit hook when present in project root`
  - `should handle failing or hanging hooks gracefully with timeout fallback`
  - `should rewrite raw conversational prompt into structured XML tags`
  - `should bypass rewriting when optimizePrompt is toggled off`
  - `should inject project context inside <project_architecture_and_guidelines> XML blocks`

---

## File Modification Map

### New Files
- [NEW] `packages/cli/src/lib/diagnostics.ts` — Linter & TypeScript diagnostics runner
- [NEW] `packages/cli/src/lib/diagnostics.test.ts` — Unit tests for diagnostics
- [NEW] `packages/cli/src/lib/fallback-router.ts` — Multi-model resilience & cascade routing
- [NEW] `packages/cli/src/lib/fallback-router.test.ts` — Unit tests for fallback routing
- [NEW] `packages/cli/src/lib/checkpoint-manager.ts` — Snapshot and `/undo` engine
- [NEW] `packages/cli/src/lib/checkpoint-manager.test.ts` — Unit tests for checkpoint engine
- [NEW] `packages/cli/src/lib/cost-tracker.ts` — Real-time token usage and cost computation
- [NEW] `packages/cli/src/lib/cost-tracker.test.ts` — Unit tests for cost tracking
- [NEW] `packages/cli/src/lib/permission-guard.ts` — Rule-based permission engine
- [NEW] `packages/cli/src/lib/permission-guard.test.ts` — Unit tests for permissions
- [NEW] `packages/cli/src/lib/prompt-hooks.ts` — Local script lifecycle hook runner
- [NEW] `packages/cli/src/lib/prompt-rewriter.ts` — Fast LLM meta-prompting rewriter
- [NEW] `packages/cli/src/lib/prompt-pipeline.ts` — 4-stage prompt orchestration engine
- [NEW] `packages/cli/src/lib/prompt-pipeline.test.ts` — Unit tests for prompt pipeline
- [NEW] `packages/cli/src/components/messages/tool-accordion.tsx` — Collapsible tool display
- [NEW] `packages/cli/src/components/messages/diff-viewer.tsx` — Styled diff hunks

### Modified Files
- [MODIFY] [packages/cli/src/lib/local-tools.ts](file:///d:/projects/nightcode/packages/cli/src/lib/local-tools.ts) — Integrate checkpointing and auto-diagnostics into `writeFile`/`editFile`
- [MODIFY] [packages/cli/src/lib/local-agent.ts](file:///d:/projects/nightcode/packages/cli/src/lib/local-agent.ts) — Hook prompt pipeline, fallback router, token recording, and permission checks
- [MODIFY] [packages/cli/src/lib/project-config.ts](file:///d:/projects/nightcode/packages/cli/src/lib/project-config.ts) — Support CLAUDE.md and AGENT.md discovery
- [MODIFY] [packages/cli/src/lib/system-prompt.ts](file:///d:/projects/nightcode/packages/cli/src/lib/system-prompt.ts) — Wrap project instructions in `<project_architecture_and_guidelines>` XML tags
- [MODIFY] [packages/cli/src/providers/prompt-config/index.tsx](file:///d:/projects/nightcode/packages/cli/src/providers/prompt-config/index.tsx) — Add `optimizePrompt` toggle state
- [MODIFY] [packages/cli/src/components/status-bar.tsx](file:///d:/projects/nightcode/packages/cli/src/components/status-bar.tsx) — Display live token/cost HUD and prompt optimization status
- [MODIFY] [packages/cli/src/components/messages/bot-message.tsx](file:///d:/projects/nightcode/packages/cli/src/components/messages/bot-message.tsx) — Render collapsible tool accordions
- [MODIFY] [packages/cli/src/components/command-menu/commands.tsx](file:///d:/projects/nightcode/packages/cli/src/components/command-menu/commands.tsx) — Add `/undo`, `/cost`, and `/optimize` commands
- [MODIFY] [package.json](file:///d:/projects/nightcode/package.json) — Add `"test": "bun test"` script

---

## Verification Plan

### Automated Tests
Run the entire test suite using Bun's native test runner:
```bash
bun test
```
All unit tests across the new modules will run in milliseconds:
- `packages/cli/src/lib/diagnostics.test.ts`
- `packages/cli/src/lib/fallback-router.test.ts`
- `packages/cli/src/lib/checkpoint-manager.test.ts`
- `packages/cli/src/lib/cost-tracker.test.ts`
- `packages/cli/src/lib/permission-guard.test.ts`
- `packages/cli/src/lib/prompt-pipeline.test.ts`

TypeScript typecheck verification across packages:
```bash
bun x tsc --noEmit
```

### Manual Verification
1. **Self-Healing Diagnostics**: Make an intentional type mistake in a test file using `editFile` and verify that the tool returns compiler diagnostics for the agent to fix.
2. **Undo Operation**: Modify a file through the agent, execute `/undo`, and verify git diff returns to a clean state.
3. **Interactive TUI**: Send a prompt requiring multiple file reads and edits; verify tool accordions collapse neatly into 1-line badges and expand when toggled.
4. **Cost Display**: Inspect the status bar after a multi-turn conversation to ensure token count and USD values update accurately.
5. **Prompt Pipeline & Rewriting**: Send an ambiguous prompt with `/optimize` enabled; verify in the terminal that the prompt is restructured into clean XML tags (`<task_type>`, `<objective>`, `<execution_guardrails>`).
6. **Lifecycle Hooks**: Create a dummy `.mastercode/hooks/userPromptSubmit.ts` script; verify that prompt submissions pass through the custom hook before reaching the LLM.
