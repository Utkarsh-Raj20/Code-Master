# Implementation Plan: Advanced Prompt Rewriting, Lifecycle Hooks & Context Pipeline

We have analyzed `pormpt.md` against MasterCode's standalone Bun-powered architecture. We can fully integrate its 4-stage prompt execution pipeline into MasterCode, adapted from single-vendor Anthropic code into our multi-model BYOK system, native Bun module loader, and OpenTUI interface.

## User Review Required

> [!IMPORTANT]
> - **Multi-Model Meta-Prompting**: Instead of hardcoding Anthropic SDK as in `pormpt.md`, the rewriter will dynamically select a fast, low-latency model from the user's active provider (e.g., `claude-3-5-haiku` for Anthropic, `gpt-4o-mini` for OpenAI, `gemini-2.0-flash` for Gemini) using the user's encrypted API key.
> - **Developer Control (`/optimize`)**: Prompt rewriting can be toggled on/off on the fly via a new `/optimize` (or `/rewrite`) command so developers retain complete control when they prefer raw prompt pass-through.
> - **Bun Dynamic Import for Hooks**: Lifecycle hooks (`.mastercode/hooks/userPromptSubmit.ts` or `.js`) execute natively under Bun without requiring transpilation. Hooks are wrapped in a 4-second safety timeout and fallback gracefully if they error.
> - **Unified Project Context**: In addition to `.mastercode.md`, project context discovery will also pick up `CLAUDE.md` and `AGENT.md`, formatting them within clean `<project_architecture_and_guidelines>` XML blocks.

---

## Architectural Flow

```
[User Input in Terminal]
          │
          ▼
[Stage 1: Lifecycle Hook & Interceptor Engine]
   • Checks `.mastercode/hooks/userPromptSubmit.{ts,js}`
   • Executes project-level custom script with timeout safety
          │
          ▼
[Stage 2: Fast LLM Meta-Prompting Rewriter]
   • If `/optimize` is ON: Calls fast LLM (Haiku / 4o-mini / Flash)
   • Strips filler, extracts archetype, generates XML tags (<task_type>, <objective>, <execution_guardrails>)
   • If `/optimize` is OFF or rewriter errors: passes prompt through safely
          │
          ▼
[Stage 3: Repository Context & Guidelines Injection]
   • Hierarchical scan for `.mastercode.md`, `CLAUDE.md`, `AGENT.md`
   • Injects formatted `<project_architecture_and_guidelines>` XML block into system prompt
          │
          ▼
[Stage 4: Main Core Agent LLM Streaming & Tool Loop]
   • In-process Hono agent executes streaming with tools
```

---

## Proposed Changes

### 1. Hook & Interceptor Engine

#### [NEW] [prompt-hooks.ts](file:///d:/projects/nightcode/packages/cli/src/lib/prompt-hooks.ts)
- Defines `HookContext`: `{ projectRoot: string, mode: ModeType, model: SupportedChatModelId }`.
- Scans for user hook scripts:
  - `.mastercode/hooks/userPromptSubmit.{ts,js}`
  - `.config/hooks/userPromptSubmit.{ts,js}`
  - `.hooks/userPromptSubmit.{ts,js}`
- Dynamically imports and executes the export default function.
- Wraps execution in `Promise.race` with a 4,000ms timeout.
- Catches errors and returns original text with a warning callback.

---

### 2. Multi-Model Meta-Prompting Rewriter

#### [NEW] [prompt-rewriter.ts](file:///d:/projects/nightcode/packages/cli/src/lib/prompt-rewriter.ts)
- Resolves a fast model ID for the active provider:
  - `anthropic` $\rightarrow$ `claude-3-5-haiku-20241022`
  - `openai` $\rightarrow$ `gpt-4o-mini`
  - `gemini` $\rightarrow$ `gemini-2.0-flash`
  - `groq` $\rightarrow$ `llama-3.3-70b-versatile`
  - `openrouter` $\rightarrow$ `anthropic/claude-3.5-haiku`
  - `deepseek` $\rightarrow$ `deepseek-chat`
  - Fallback: active model ID.
- Executes `generateText` with the structured meta-prompt:
  - Strips polite filler and conversation preamble.
  - Identifies task archetype: `Build`, `Debug`, `Refactor`, `Review`, `Explore`.
  - Outputs strictly XML tags: `<task_type>`, `<objective>`, `<execution_guardrails>`.
- Non-blocking: If API call fails or key is missing, returns the unrewritten prompt seamlessly.

---

### 3. Context Injection & System Prompt Formatting

#### [MODIFY] [project-config.ts](file:///d:/projects/nightcode/packages/cli/src/lib/project-config.ts)
- Update `INIT_FILE_NAMES` to check:
  - `.mastercode.md`
  - `CLAUDE.md`
  - `AGENT.md`
  - `.nightcode.md` (legacy fallback)

#### [MODIFY] [system-prompt.ts](file:///d:/projects/nightcode/packages/cli/src/lib/system-prompt.ts)
- Format injected project guidelines inside structured XML tags:
  ```markdown
  <project_architecture_and_guidelines file="CLAUDE.md">
  ...
  </project_architecture_and_guidelines>
  ```

---

### 4. Pipeline Orchestration & Agent Integration

#### [NEW] [prompt-pipeline.ts](file:///d:/projects/nightcode/packages/cli/src/lib/prompt-pipeline.ts)
- Coordinates the complete flow:
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

#### [MODIFY] [local-agent.ts](file:///d:/projects/nightcode/packages/cli/src/lib/local-agent.ts)
- In the `POST /chat` endpoint, run `runPromptPipeline` on incoming user messages before `streamText`.
- Pass along `optimizePrompt` from message metadata / request headers.

---

### 5. Interactive UI Toggle & OpenTUI Integration

#### [MODIFY] [prompt-config/index.tsx](file:///d:/projects/nightcode/packages/cli/src/providers/prompt-config/index.tsx)
- Add `optimizePrompt: boolean` (default: `true`) and `toggleOptimizePrompt: () => void`.

#### [MODIFY] [commands.tsx](file:///d:/projects/nightcode/packages/cli/src/components/command-menu/commands.tsx)
- Add `/optimize` command (alias `/rewrite`) to toggle prompt optimization on/off with an instant toast.

#### [MODIFY] [status-bar.tsx](file:///d:/projects/nightcode/packages/cli/src/components/status-bar.tsx)
- Render optimization status badge: `✨ opt:on` or `opt:off`.

---

## Verification Plan

### Automated Tests
1. **Pipeline & Interceptor Test**:
   ```bash
   bun test packages/cli/src/lib/prompt-pipeline.test.ts
   ```
   - Tests hook execution and timeout fallback.
   - Tests meta-prompting rewriter XML generation.
   - Tests context injection with `.mastercode.md` and `CLAUDE.md`.
   - Tests `/optimize` toggle bypass.
2. **Build Verification**:
   ```bash
   bun run build:cli
   ```
   - Ensures clean bundling without type errors.

### Manual Verification
1. **Hook Interception**: Create `.mastercode/hooks/userPromptSubmit.ts` returning `[CUSTOM_PREFIX] ${prompt}`; submit a prompt and verify the prefix is captured in the conversation.
2. **Prompt Rewriting**: Toggle `/optimize`; submit a noisy prompt (e.g. *"hey can you please help me fix the router error in my code"*); verify it is restructured into clean `<task_type>`, `<objective>`, and `<execution_guardrails>`.
3. **Toggle Off**: Run `/optimize` to turn off; verify subsequent prompts are sent verbatim.
