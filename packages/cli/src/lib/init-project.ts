/**
 * init-project.ts
 *
 * Powers the `/init` command — scans the current project, sends a targeted
 * prompt to the active AI model, and writes the result to `.mastercode.md`.
 *
 * Mirrors Claude Code's `/init` workflow:
 *   1. Discover key project files (package.json, README, tsconfig, etc.)
 *   2. Read a representative sample of the source tree
 *   3. Ask the AI to generate comprehensive project instructions
 *   4. Write the result to `.mastercode.md` in the project root
 */
import fs from "node:fs";
import path from "node:path";
import { generateText } from "ai";
import { resolveChatModel } from "./providers";
import { getActiveProvider, getKey } from "./key-store";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INIT_FILE = ".mastercode.md";
const MAX_FILE_BYTES = 8_000;
const MAX_FILES_SCANNED = 30;

// Files / dirs to skip when building the file tree snapshot
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", ".turbo",
  ".cache", "coverage", ".nyc_output", "__pycache__", ".venv", "venv",
]);
const SKIP_EXTENSIONS = new Set([
  ".lock", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff",
  ".woff2", ".ttf", ".eot", ".mp4", ".mp3", ".zip", ".tar", ".gz",
  ".exe", ".dll", ".so", ".dylib", ".wasm",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a file safely, capping at MAX_FILE_BYTES. */
function safeRead(filePath: string): string {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (raw.length > MAX_FILE_BYTES) {
      return raw.slice(0, MAX_FILE_BYTES) + `\n... (truncated — ${raw.length} total chars)`;
    }
    return raw;
  } catch {
    return "(unreadable)";
  }
}

/** Build a compact directory tree string (depth-limited). */
function buildTree(dir: string, prefix = "", depth = 0): string {
  if (depth > 3) return "";
  let result = "";
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return "";
  }

  // Directories first, then files; skip hidden / blacklisted
  const filtered = entries
    .filter((e) => {
      if (e.name.startsWith(".") && e.name !== ".mastercode.md" && e.name !== ".nightcode.md") return false;
      if (SKIP_DIRS.has(e.name)) return false;
      if (!e.isDirectory() && SKIP_EXTENSIONS.has(path.extname(e.name))) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  for (let i = 0; i < filtered.length; i++) {
    const entry = filtered[i]!;
    const isLast = i === filtered.length - 1;
    const connector = isLast ? "└── " : "├── ";
    result += `${prefix}${connector}${entry.name}${entry.isDirectory() ? "/" : ""}\n`;
    if (entry.isDirectory()) {
      result += buildTree(
        path.join(dir, entry.name),
        prefix + (isLast ? "    " : "│   "),
        depth + 1,
      );
    }
  }
  return result;
}

/** Collect the most important source files to show the AI. */
function collectKeyFiles(cwd: string): { path: string; content: string }[] {
  const priority: string[] = [
    "package.json", "README.md", "README", "tsconfig.json", "tsconfig.base.json",
    ".eslintrc.json", ".eslintrc.js", "eslint.config.js", "eslint.config.mjs",
    "biome.json", "vite.config.ts", "vite.config.js",
    "next.config.ts", "next.config.js",
    "bun.config.ts", "bunfig.toml",
    "Makefile", "Dockerfile", "docker-compose.yml",
    "pyproject.toml", "setup.py", "requirements.txt", "Cargo.toml", "go.mod",
  ];

  const collected: { path: string; content: string }[] = [];

  // 1. Priority files first
  for (const name of priority) {
    const full = path.join(cwd, name);
    if (fs.existsSync(full)) {
      collected.push({ path: name, content: safeRead(full) });
    }
  }

  // 2. Walk src / lib / app for source files (up to the limit)
  const srcRoots = ["src", "lib", "app", "pages", "components", "server", "packages"];
  const walkForSource = (dir: string, rel: string) => {
    if (collected.length >= MAX_FILES_SCANNED) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (collected.length >= MAX_FILES_SCANNED) break;
      if (SKIP_DIRS.has(entry.name)) continue;
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      const entryFull = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkForSource(entryFull, entryRel);
      } else if (
        !SKIP_EXTENSIONS.has(path.extname(entry.name)) &&
        !priority.includes(entry.name) &&
        !collected.find((f) => f.path === entryRel)
      ) {
        collected.push({ path: entryRel, content: safeRead(entryFull) });
      }
    }
  };

  for (const root of srcRoots) {
    const full = path.join(cwd, root);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      walkForSource(full, root);
    }
  }

  return collected;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type InitResult =
  | { ok: true; filePath: string; existed: boolean }
  | { ok: false; error: string };

/**
 * Run the `/init` workflow:
 *  1. Snapshot the project
 *  2. Ask the AI to generate a `.mastercode.md`
 *  3. Write the file and return the result
 *
 * @param modelId  The currently selected chat model ID
 * @param cwd      The project root (defaults to process.cwd())
 */
export async function runInit(
  modelId: string,
  cwd: string = process.cwd(),
): Promise<InitResult> {
  const outPath = path.join(cwd, INIT_FILE);

  // Resolve model + API key
  const provider = getActiveProvider();
  const apiKey = provider ? getKey(provider) : null;

  let resolved;
  try {
    resolved = resolveChatModel({
      modelId,
      apiKey: apiKey ?? undefined,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not resolve AI model",
    };
  }

  // Build project snapshot
  const tree = buildTree(cwd);
  const keyFiles = collectKeyFiles(cwd);
  const existed = fs.existsSync(outPath);
  const existingContent = existed ? safeRead(outPath) : null;

  const fileContext = keyFiles
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");

  // Ask the AI
  const prompt = `You are initialising a Mastercode project configuration file.

Mastercode is a standalone AI coding CLI (like Claude Code). When a user runs \`/init\` in their project directory, you analyse the codebase and produce a \`.mastercode.md\` file that acts as the project's persistent memory — injected verbatim into the system prompt on every session.

## Project Directory Tree
\`\`\`
${tree || "(empty)"}
\`\`\`

## Key Project Files
${fileContext || "(none found)"}

${existingContent ? `## Existing .mastercode.md (update/improve this)\n\`\`\`markdown\n${existingContent}\n\`\`\`` : ""}

---

Generate a comprehensive \`.mastercode.md\` for this project. The file should cover:

1. **Project Overview** — What the project is and does (1-2 sentences)
2. **Architecture** — Key packages/modules and their roles
3. **Tech Stack** — Languages, frameworks, notable libraries
4. **Common Commands** — How to run, build, test, lint the project
5. **Code Style** — Naming conventions, file organisation patterns, key rules
6. **Important Context** — Anything an AI assistant must know to be useful (e.g. custom tooling, env vars, avoid-list, etc.)

Rules for the output:
- Write in clean Markdown
- Be concise but complete — every bullet should add value
- Omit sections that don't apply or have no information
- Output ONLY the raw Markdown content for \`.mastercode.md\` — no preamble, no explanation, no code fences around the whole thing
- Start directly with the project name as an \`#\` heading`;

  let text: string;
  try {
    const result = await generateText({
      model: resolved.model,
      prompt,
      maxOutputTokens: 2000,
      providerOptions: resolved.providerOptions,
    });
    text = result.text.trim();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "AI generation failed",
    };
  }

  // Write the file
  try {
    fs.writeFileSync(outPath, text, "utf8");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to write .mastercode.md",
    };
  }

  return { ok: true, filePath: outPath, existed };
}
