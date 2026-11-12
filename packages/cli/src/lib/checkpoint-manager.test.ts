import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointManager } from "./checkpoint-manager";

let tempDir: string;

beforeEach(() => {
  CheckpointManager.clear();
  tempDir = mkdtempSync(join(tmpdir(), "checkpoint-"));
});

afterEach(() => {
  CheckpointManager.clear();
  rmSync(tempDir, { recursive: true, force: true });
});

function write(path: string, content: string) {
  writeFileSync(path, content, "utf-8");
}

describe("CheckpointManager", () => {
  test("should take snapshot of existing file before edit", async () => {
    const file = join(tempDir, "a.txt");
    write(file, "original");

    await CheckpointManager.recordPreEdit(file);

    expect(CheckpointManager.getHistoryCount()).toBe(1);
    // Recording a snapshot must not mutate the file.
    expect(readFileSync(file, "utf-8")).toBe("original");
  });

  test("should restore exact original content upon rollback", async () => {
    const file = join(tempDir, "b.ts");
    write(file, "const x = 1;\n");

    await CheckpointManager.recordPreEdit(file);
    write(file, "const x = 2;\n");

    await CheckpointManager.rollbackLastStep();
    expect(readFileSync(file, "utf-8")).toBe("const x = 1;\n");
  });

  test("should delete created file upon rollback if original did not exist", async () => {
    const file = join(tempDir, "new-file.ts");
    expect(existsSync(file)).toBe(false);

    await CheckpointManager.recordPreEdit(file);
    write(file, "brand new content");

    const result = await CheckpointManager.rollbackLastStep();
    expect(result.restoredFiles).toContain(file);
    expect(existsSync(file)).toBe(false);
  });

  test("should handle multi-file transactions in a single step", async () => {
    const a = join(tempDir, "a.ts");
    const b = join(tempDir, "b.ts");
    write(a, "A1");
    write(b, "B1");

    await CheckpointManager.recordPreEdit(a);
    await CheckpointManager.recordPreEdit(b);
    expect(CheckpointManager.getHistoryCount()).toBe(2);

    write(a, "A2");
    write(b, "B2");

    const result = await CheckpointManager.rollbackLastStep();
    expect(result.restoredFiles.slice().sort()).toEqual([a, b].sort());
    expect(readFileSync(a, "utf-8")).toBe("A1");
    expect(readFileSync(b, "utf-8")).toBe("B1");
  });

  test("should return empty list when no checkpoints exist", async () => {
    const result = await CheckpointManager.rollbackLastStep();
    expect(result.restoredFiles).toEqual([]);
    expect(result.stepId).toBeNull();
  });
});
