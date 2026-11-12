<div align="center">

<br />
<br />

<h1>mastercode</h1>

<p>A fully local, terminal-based AI coding agent.</p>

<p>Plan, chat, and build inside your project — entirely from the terminal.<br />Built with Bun, OpenTUI + React, Hono, Vercel AI SDK, and MCP.</p>

<br />

<p>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white" alt="Bun" /></a>&nbsp;
  <a href="https://github.com/nicholasgasior/opentui"><img src="https://img.shields.io/badge/OpenTUI-111111?style=for-the-badge" alt="OpenTUI" /></a>&nbsp;
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" /></a>&nbsp;
  <a href="https://hono.dev"><img src="https://img.shields.io/badge/Hono-E36002?style=for-the-badge&logo=hono&logoColor=white" alt="Hono" /></a>&nbsp;
  <a href="https://sdk.vercel.ai"><img src="https://img.shields.io/badge/AI_SDK-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="AI SDK" /></a>&nbsp;
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-4A90D9?style=for-the-badge" alt="MCP" /></a>
</p>

</div>

<br />

## ✨ What Is Mastercode?

Mastercode is a **standalone, privacy-first AI coding assistant** that runs entirely in your terminal. Unlike cloud-hosted agents, Mastercode:

- Runs **100% locally** — your code never leaves your machine
- Connects to any AI provider via API keys you control
- Gives the AI structured tools to read, write, edit, and run commands in your project
- Supports **MCP (Model Context Protocol)** servers for extensibility
- Ships with a **skills system** that auto-activates domain expertise based on your prompts

Think of it as your own local Claude Code / Cursor agent — but open-source, customizable, and provider-agnostic.

## 🎬 Features

### Core Agent
- **Plan & Build Modes** — Read-only planning tools or full write/edit/shell execution
- **Multi-Provider Support** — Anthropic (Claude), OpenAI (GPT), Google (Gemini), DeepSeek, Groq, OpenRouter
- **Streaming Responses** — Real-time AI SDK streaming with token-by-token rendering
- **Automatic Fallback Routing** — If a provider returns 429/500/503, seamlessly falls back to the next configured provider
- **Cost Tracking** — Per-session token and USD cost telemetry with a per-model pricing registry

### Tools
| Tool | Mode | Description |
|------|------|-------------|
| `readFile` | Plan + Build | Read any file in the project |
| `listDirectory` | Plan + Build | List directory contents |
| `glob` | Plan + Build | Find files by glob pattern |
| `grep` | Plan + Build | Regex search across files |
| `symbolTopology` | Plan + Build | AST-powered symbol lookup and dependency graph |
| `activateSkill` | Plan + Build | Load domain-specific instructions from the skills catalog |
| `writeFile` | Build only | Create or overwrite files |
| `editFile` | Build only | Surgical find-and-replace edits |
| `bash` | Build only | Run shell commands with timeout and permission checks |
| `mcp__*` | Build only | Dynamically registered MCP server tools |

### Safety & Control
- **Permission Guard** — Zero-trust rule engine that auto-allows safe reads, blocks destructive commands (`rm -rf`, `git push --force`), and protects sensitive files (`.env`, `.git`)
- **Checkpoint & Undo** — Every file mutation is snapshotted; `/undo` atomically rolls back the last agent turn
- **Rolling Memory** — Sliding-window conversation compression prevents context-window overflow in long sessions

### Skills System
Skills are domain-specific instruction packs (markdown files with YAML frontmatter) that **auto-activate based on your prompt keywords**. No manual invocation needed — just ask naturally.

**Built-in Skills:**

| Skill | Triggers |
|-------|----------|
| `api-design` | api, rest, graphql, endpoint, openapi, swagger |
| `backend-api` | backend, api, rest, graphql, express, hono, fastapi |
| `code-review` | review, refactor, clean code, code quality, lint |
| `database-architect` | database, schema, migration, sql, prisma, drizzle |
| `docker-devops` | docker, kubernetes, ci/cd, github actions, deploy |
| `frontend-design` | frontend, react, next.js, tailwind, css, responsive |
| `git-workflow` | git, branch, merge, rebase, commit, pr |
| `react-performance` | performance, web vitals, render, memoization |
| `security-hardening` | security, owasp, xss, csrf, injection, auth |
| `systematic-debugging` | debug, error, bug, crash, stack trace |
| `test-driven-development` | test, tdd, jest, vitest, coverage, mock |
| `ui-ux-craft` | ui, ux, design, animation, dark mode, layout |

You can also add **project-level skills** in `.mastercode/skills/<name>/SKILL.md`.

### MCP Integration
Mastercode discovers MCP servers from:
1. `.mcp.json` in the project root
2. `~/.mcp.json` for global servers
3. `.mastercode/mcp.json` for project-specific configs

Supports **stdio**, **SSE**, and **streamable HTTP** transports. MCP tools appear as `mcp__<server>__<tool>` and are available to the agent automatically.

### Terminal UI
- Full **React-based TUI** powered by OpenTUI
- Searchable dialogs for models, skills, sessions, agents, themes, and API keys
- Status bar with mode toggle, model info, cost summary, and session name
- Markdown rendering with syntax highlighting in the terminal
- Keyboard-driven command menu (`/` prefix)

### Slash Commands

| Command | Description |
|---------|-------------|
| `/new` | Start a new conversation |
| `/init` | Initialize project config (`.mastercode.md`) |
| `/model` | Switch AI model |
| `/keys` | Manage API keys |
| `/mode` | Toggle Plan ↔ Build mode |
| `/skills` | Browse and search available skills |
| `/agents` | Switch between agent profiles |
| `/sessions` | Browse saved sessions |
| `/theme` | Change terminal theme |
| `/cost` | View session token usage and cost |
| `/undo` | Undo last agent file changes |
| `/mcp` | View MCP server status |
| `/logs` | View agent logs and last error |
| `/diagnostics` | Run TypeScript/syntax diagnostics |
| `/compact` | Compress conversation history |
| `/clear` | Clear terminal output |

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+ installed
- At least one AI provider API key (Anthropic, OpenAI, Google, DeepSeek, Groq, or OpenRouter)

### 1. Clone and install

```bash
git clone https://github.com/Utkarsh-Raj20/Code-Master.git
cd Code-Master
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Add your API keys (you only need at least one):

```bash
# AI Provider Keys (add whichever you want to use)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=sk-...
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-...

# Optional: Google Stitch MCP server
GOOGLE_API_KEY=...
```

> **Note:** You can also add/manage API keys at runtime using the `/keys` command inside the CLI.

### 3. Run the CLI

```bash
bun run dev
```

That's it! Mastercode starts in your terminal, ready to assist with your project.

### 4. (Optional) Install globally

To use `mastercode` as a global command from any directory:

```bash
bun run link:cli
mastercode
```

Or use the install script:

```bash
bun run link:global
```

## 📁 Project Structure

```
.
├── .mastercode/                    # Project-level config
│   └── skills/                     # Project-specific skills (SKILL.md files)
├── .mcp.json                       # MCP server configuration
├── packages/
│   ├── cli/                        # The main CLI application
│   │   ├── bin/                    # Executable shims (mastercode, nightcode)
│   │   ├── skills/                 # Built-in skills (13 skill packs)
│   │   └── src/
│   │       ├── components/         # Terminal UI (dialogs, messages, status bar, command menu)
│   │       ├── hooks/              # Chat and UI hooks
│   │       ├── layouts/            # Root terminal layouts
│   │       ├── lib/                # Core engine
│   │       │   ├── local-agent.ts        # Main agent loop (Hono router + AI SDK streaming)
│   │       │   ├── local-tools.ts        # Tool execution engine
│   │       │   ├── skill-manager.ts      # Skill discovery, loading, and catalog
│   │       │   ├── mcp-manager.ts        # MCP client lifecycle and tool bridging
│   │       │   ├── ast-indexer.ts        # TypeScript AST topology indexer
│   │       │   ├── permission-guard.ts   # Zero-trust permission engine
│   │       │   ├── checkpoint-manager.ts # File snapshot and undo system
│   │       │   ├── rolling-memory.ts     # Conversation compression engine
│   │       │   ├── cost-tracker.ts       # Token and cost telemetry
│   │       │   ├── fallback-router.ts    # Provider fallback on errors
│   │       │   ├── agent-logger.ts       # Structured JSONL logging
│   │       │   ├── prompt-rewriter.ts    # Prompt pipeline processing
│   │       │   ├── session-store.ts      # Local session persistence
│   │       │   └── providers/            # AI provider adapters (anthropic, openai, google, deepseek, groq, openrouter)
│   │       ├── providers/          # React context providers (dialog, keyboard, theme, toast)
│   │       └── screens/            # Home, new session, and session screens
│   └── shared/                     # Shared Zod schemas, tool contracts, and model definitions
└── package.json
```

## 🧪 Running Tests

```bash
# Run all tests
bun test

# Run CLI tests only
bun run test:cli

# Run specific test files
bun test packages/cli/src/lib/skill-manager.test.ts
bun test packages/cli/src/lib/permission-guard.test.ts
```

Test coverage includes: agent logger, cost tracker, diagnostics, fallback router, permission guard, skill manager, AST indexer, MCP manager, rolling memory, project config, and prompt pipeline.

## 🛠 Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start the CLI in watch mode |
| `bun run dev:cli` | Same as `dev` (alias) |
| `bun run build:cli` | Build the CLI package |
| `bun run link:cli` | Build and link the `mastercode` global binary |
| `bun run link:global` | Install via the global install script |
| `bun test` | Run all tests |
| `bun run test:cli` | Run CLI package tests |
| `bun run typecheck` | TypeScript type checking (`tsc --noEmit`) |

## 🔧 Adding Custom Skills

Create a `SKILL.md` file in `.mastercode/skills/<skill-name>/`:

```markdown
---
name: my-custom-skill
description: What this skill does
triggers:
  - keyword1
  - keyword2
  - keyword3
---

# My Custom Skill

Detailed instructions the AI will follow when this skill activates...
```

The skill auto-activates when your prompt mentions any of the trigger keywords. You can also browse all skills with `/skills` and manually select one.

## 🔌 Adding MCP Servers

Add servers to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@some/mcp-server"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      }
    },
    "remote-server": {
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${MY_TOKEN}"
      }
    }
  }
}
```

Environment variable placeholders (`${VAR}`) are resolved from your `.env` file at runtime.

## 📦 Packages

| Package | Description |
|---------|-------------|
| `@mastercode/cli` | Standalone terminal UI, in-process agent engine, skills, MCP client, and AI provider adapters |
| `@mastercode/shared` | Shared Zod schemas, AI tool contracts (read-only + build), and model definitions |

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`bun test`)
4. Run type checks (`bun run typecheck`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📄 License

This project is open source. See the repository for license details.
