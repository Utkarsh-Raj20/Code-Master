import { describe, expect, test } from "bun:test";
import { evaluateToolPermission } from "./permission-guard";

describe("evaluateToolPermission", () => {
  test("should allow safe read-only tools without prompting (readFile, grep)", () => {
    expect(evaluateToolPermission("readFile", { path: "src/index.ts" }).decision).toBe("allow");
    expect(evaluateToolPermission("grep", { pattern: "TODO" }).decision).toBe("allow");
    expect(evaluateToolPermission("listDirectory", {}).decision).toBe("allow");
    expect(evaluateToolPermission("glob", { pattern: "**/*.ts" }).decision).toBe("allow");
  });

  test("should allow harmless shell commands (git status, bun test)", () => {
    expect(evaluateToolPermission("bash", { command: "git status" }).decision).toBe("allow");
    expect(evaluateToolPermission("bash", { command: "git diff" }).decision).toBe("allow");
    expect(evaluateToolPermission("bash", { command: "bun test" }).decision).toBe("allow");
    expect(evaluateToolPermission("bash", { command: "npm test" }).decision).toBe("allow");
    expect(evaluateToolPermission("bash", { command: "ls -la" }).decision).toBe("allow");
  });

  test("should prompt or block destructive commands (rm -rf, git push --force)", () => {
    const rm = evaluateToolPermission("bash", { command: "rm -rf ./node_modules" });
    expect(rm.decision).not.toBe("allow");
    expect(rm.riskLevel).toBe("high");

    const push = evaluateToolPermission("bash", { command: "git push --force origin main" });
    expect(push.decision).not.toBe("allow");
    expect(push.riskLevel).toBe("high");

    const reset = evaluateToolPermission("bash", { command: "git reset --hard HEAD~1" });
    expect(reset.decision).not.toBe("allow");
    expect(reset.riskLevel).toBe("high");
  });

  test("should protect critical files (.env, .git)", () => {
    expect(evaluateToolPermission("writeFile", { path: ".env", content: "SECRET=1" }).decision).toBe("deny");
    expect(evaluateToolPermission("writeFile", { path: "config/.env.local", content: "x" }).decision).toBe("deny");
    expect(evaluateToolPermission("editFile", { path: ".git/config", oldString: "a", newString: "b" }).decision).toBe("deny");
    expect(evaluateToolPermission("writeFile", { path: "id_rsa", content: "key" }).decision).toBe("deny");

    // Normal workspace writes remain allowed.
    expect(evaluateToolPermission("writeFile", { path: "src/index.ts", content: "export {}" }).decision).toBe("allow");
  });
});
