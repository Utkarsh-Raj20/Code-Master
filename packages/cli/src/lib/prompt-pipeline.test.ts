import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPromptHook } from "./prompt-hooks";
import { runPromptPipeline } from "./prompt-pipeline";
import { buildSystemPrompt } from "./system-prompt";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "prompt-pipeline-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("prompt-pipeline", () => {
  test("should pass prompt through unmodified when optimizePrompt is false", async () => {
    const result = await runPromptPipeline({
      rawInput: "fix the router bug",
      projectRoot: tempDir,
      mode: "BUILD",
      model: "claude-3-5-sonnet",
      provider: "anthropic",
      apiKey: null,
      optimizePrompt: false,
    });

    expect(result.finalPrompt).toBe("fix the router bug");
    expect(result.wasRewritten).toBe(false);
    expect(result.hookExecuted).toBe(false);
  });

  test("should execute user hook with timeout protection", async () => {
    const hookDir = join(tempDir, ".mastercode", "hooks");
    mkdirSync(hookDir, { recursive: true });
    writeFileSync(
      join(hookDir, "userPromptSubmit.ts"),
      'export default function (prompt: string) { return `[HOOK] ${prompt}`; }\n',
      "utf-8",
    );

    const { prompt, hookExecuted } = await runPromptHook("hello", {
      projectRoot: tempDir,
      mode: "BUILD",
      model: "claude-3-5-sonnet",
    });

    expect(hookExecuted).toBe(true);
    expect(prompt).toBe("[HOOK] hello");
  });

  test("should fallback gracefully if user hook throws or hangs", async () => {
    const hookDir = join(tempDir, ".mastercode", "hooks");
    mkdirSync(hookDir, { recursive: true });
    writeFileSync(
      join(hookDir, "userPromptSubmit.ts"),
      'export default function () { throw new Error("boom"); }\n',
      "utf-8",
    );

    const warnings: string[] = [];
    const { prompt, hookExecuted } = await runPromptHook(
      "hello",
      { projectRoot: tempDir, mode: "BUILD", model: "claude-3-5-sonnet" },
      (msg) => warnings.push(msg),
    );

    expect(hookExecuted).toBe(false);
    expect(prompt).toBe("hello");
    expect(warnings.some((w) => w.includes("boom") || w.includes("failed"))).toBe(true);
  });

  test("should format guidelines inside XML tags", () => {
    const prompt = buildSystemPrompt({
      mode: "BUILD",
      projectConfig: "Always use tabs",
      configFileName: "CLAUDE.md",
    });

    expect(prompt).toContain('<project_architecture_and_guidelines file="CLAUDE.md">');
    expect(prompt).toContain("Always use tabs");
    expect(prompt).toContain("</project_architecture_and_guidelines>");
  });
});
