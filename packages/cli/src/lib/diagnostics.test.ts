import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findNearestTsConfig, runDiagnostics } from "./diagnostics";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "diagnostics-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("diagnostics", () => {
  test("should detect syntax errors via checkSyntaxWithBun", async () => {
    const file = join(tempDir, "broken.ts");
    writeFileSync(file, "const = ;\n", "utf-8");

    const result = await runDiagnostics(file, tempDir);

    expect(result.hasErrors).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.formatted.some((line) => line.toLowerCase().includes("error"))).toBe(true);
  });

  test("should return empty issues for valid TypeScript file", async () => {
    const file = join(tempDir, "valid.ts");
    writeFileSync(file, "export const answer: number = 42;\n", "utf-8");

    const result = await runDiagnostics(file, tempDir);

    expect(result.hasErrors).toBe(false);
    expect(result.issues).toEqual([]);
    expect(result.formatted).toEqual([]);
  });

  test("should locate nearest tsconfig.json climbing directory tree", () => {
    const nested = join(tempDir, "a", "b", "c");
    mkdirSync(nested, { recursive: true });
    const tsconfig = join(tempDir, "a", "b", "tsconfig.json");
    writeFileSync(tsconfig, "{}", "utf-8");
    const file = join(nested, "file.ts");
    writeFileSync(file, "const x = 1;\n", "utf-8");

    expect(findNearestTsConfig(file, tempDir)).toBe(tsconfig);
  });

  test("should gracefully handle non-existent files or timeouts", async () => {
    const missing = join(tempDir, "does-not-exist.ts");
    const result = await runDiagnostics(missing, tempDir);

    expect(result.hasErrors).toBe(false);
    expect(result.issues).toEqual([]);
    expect(result.formatted).toEqual([]);
  });
});
