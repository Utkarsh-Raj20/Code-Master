import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findProjectConfig, getProjectConfigPath, getProjectName } from "./project-config";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "proj-cfg-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("project-config", () => {
  test("getProjectName should extract name from package.json or directory", () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "@myorg/my-app" }),
      "utf8",
    );
    expect(getProjectName(tempDir)).toBe("my-app");
  });

  test("findProjectConfig should prioritize <projectname>.md over .mastercode.md", () => {
    const projName = getProjectName(tempDir);
    const customConfig = join(tempDir, `${projName}.md`);
    const fallbackConfig = join(tempDir, ".mastercode.md");

    writeFileSync(customConfig, "# Custom Project Rules", "utf8");
    writeFileSync(fallbackConfig, "# Fallback Rules", "utf8");

    const content = findProjectConfig(tempDir);
    expect(content).toBe("# Custom Project Rules");

    const resolvedPath = getProjectConfigPath(tempDir);
    expect(resolvedPath).toBe(customConfig);
  });

  test("findProjectConfig should fallback to .mastercode.md when <projectname>.md is absent", () => {
    const fallbackConfig = join(tempDir, ".mastercode.md");
    writeFileSync(fallbackConfig, "# Fallback Rules", "utf8");

    const content = findProjectConfig(tempDir);
    expect(content).toBe("# Fallback Rules");

    const resolvedPath = getProjectConfigPath(tempDir);
    expect(resolvedPath).toBe(fallbackConfig);
  });

  test("findProjectConfig should walk up to parent directories", () => {
    const projName = getProjectName(tempDir);
    writeFileSync(join(tempDir, `${projName}.md`), "# Parent Instructions", "utf8");

    const subDir = join(tempDir, "src", "deep");
    mkdirSync(subDir, { recursive: true });

    const content = findProjectConfig(subDir);
    expect(content).toBe("# Parent Instructions");
  });
});
