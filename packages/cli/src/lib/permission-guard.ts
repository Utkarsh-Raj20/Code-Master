/**
 * Zero-trust, rule-based permission engine.
 *
 * Auto-allows harmless read operations and known-safe shell commands while
 * flagging destructive commands and protected-file mutations for approval or
 * outright denial.
 */

export type PermissionDecision = "allow" | "deny" | "prompt";
export type RiskLevel = "low" | "medium" | "high";

export interface PermissionCheckResult {
  decision: PermissionDecision;
  reason: string;
  riskLevel: RiskLevel;
}

const READ_ONLY_TOOLS = new Set(["readFile", "listDirectory", "glob", "grep"]);

interface DangerousPattern {
  regex: RegExp;
  label: string;
}

const DANGEROUS_COMMAND_PATTERNS: DangerousPattern[] = [
  { regex: /(^|\s)rm(\s+-\S*[rR]\S*|\s+--recursive)(\s|$)/i, label: "recursive delete" },
  { regex: /(^|\s)rm(\s+--no-preserve-root)/i, label: "rm --no-preserve-root" },
  { regex: /git\s+reset\s+--hard/i, label: "git reset --hard" },
  { regex: /git\s+push\s+(-\S+\s+)*(--force|-f)(\s|$)/i, label: "force push" },
  { regex: /curl[^|\n]*\|\s*(ba|z|k)?sh(\s|$)/i, label: "curl piped to shell" },
  { regex: /(^|\s)(sudo\s+)?kill(\s+-9|\s|$)/i, label: "process kill" },
  { regex: /(^|\s)mkfs(\.\S+)?(\s|$)/i, label: "format filesystem" },
  { regex: /(^|\s)diskpart(\s|$)/i, label: "disk partitioning" },
  { regex: /dd\s+if=.*of=\/dev\//i, label: "write to raw device" },
  { regex: /:\s*>\s*\/dev\/sd/i, label: "redirect to raw device" },
];

const SAFE_COMMAND_PATTERNS: RegExp[] = [
  /^(git\s+status)(\s|$)/i,
  /^(git\s+diff)(\s|$)/i,
  /^(git\s+log)(\s|$)/i,
  /^(ls)(\s|$)/i,
  /^(cat\s)/i,
  /^(echo)(\s|$)/i,
  /^(bun\s+test)(\s|$)/i,
  /^(bunx?\s+test)(\s|$)/i,
  /^(npm\s+test)(\s|$)/i,
  /^(npm\s+run\s+test)(\s|$)/i,
  /^(tsc)(\s+--noEmit|\s|$)/i,
  /^(bun\s+x\s+tsc)(\s+--noEmit|\s|$)/i,
  /^(bunx\s+tsc)(\s+--noEmit|\s|$)/i,
];

function readString(input: unknown, key: string): string | undefined {
  if (input && typeof input === "object" && key in input) {
    const value = (input as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function isProtectedPath(p: string): { protected: boolean; reason?: string } {
  const normalized = normalizePath(p);
  const segments = normalized.split("/").filter(Boolean);
  const basename = segments[segments.length - 1] ?? normalized;

  if (segments.includes(".git")) {
    return { protected: true, reason: "writing inside the .git directory" };
  }
  if (basename.startsWith(".env")) {
    return { protected: true, reason: "writing an environment variable file" };
  }
  if (/id_(rsa|ed25519|ecdsa)|\.pem$|\.key$/i.test(basename)) {
    return { protected: true, reason: "writing a private key file" };
  }

  return { protected: false };
}

function isDependencyRemoval(path: string, input: unknown): boolean {
  const normalized = normalizePath(path);
  const segments = normalized.split("/").filter(Boolean);
  const basename = segments[segments.length - 1] ?? normalized;
  if (basename !== "package.json") return false;

  const oldString = readString(input, "oldString") ?? "";
  const newString = readString(input, "newString") ?? "";

  // Heuristic: removing a quoted dependency/script key without replacing it.
  return (
    newString.trim() === "" &&
    /["'][a-zA-Z0-9@/_-]+["']\s*:/.test(oldString)
  );
}

/**
 * Evaluate whether a tool invocation is safe to run without prompting.
 */
export function evaluateToolPermission(
  toolName: string,
  input: unknown,
  autoApproveSafe: boolean = true,
): PermissionCheckResult {
  if (READ_ONLY_TOOLS.has(toolName)) {
    return {
      decision: autoApproveSafe ? "allow" : "prompt",
      reason: "Read-only tool",
      riskLevel: "low",
    };
  }

  if (toolName === "bash") {
    const command = (readString(input, "command") ?? "").trim();
    if (!command) {
      return { decision: "allow", reason: "Empty command", riskLevel: "low" };
    }

    for (const { regex, label } of DANGEROUS_COMMAND_PATTERNS) {
      if (regex.test(command)) {
        return {
          decision: "prompt",
          reason: `Destructive command detected (${label})`,
          riskLevel: "high",
        };
      }
    }

    for (const pattern of SAFE_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        return {
          decision: autoApproveSafe ? "allow" : "prompt",
          reason: "Known-safe shell command",
          riskLevel: "low",
        };
      }
    }

    // Denylist approach: commands not matching a destructive pattern are allowed.
    return {
      decision: "allow",
      reason: "Command not matched by destructive patterns",
      riskLevel: "medium",
    };
  }

  if (toolName === "writeFile" || toolName === "editFile") {
    const filePath = readString(input, "path") ?? "";
    const protectedCheck = isProtectedPath(filePath);
    if (protectedCheck.protected) {
      return {
        decision: "deny",
        reason: protectedCheck.reason ?? "Protected file",
        riskLevel: "high",
      };
    }

    if (toolName === "editFile" && isDependencyRemoval(filePath, input)) {
      return {
        decision: "prompt",
        reason: "Removing a dependency from package.json",
        riskLevel: "high",
      };
    }

    return {
      decision: "allow",
      reason: "File mutation within workspace",
      riskLevel: "low",
    };
  }

  return {
    decision: "prompt",
    reason: `Unknown tool '${toolName}'`,
    riskLevel: "medium",
  };
}
