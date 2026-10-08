import fs from "node:fs";
import path from "node:path";

export interface DiagnosticIssue {
  file: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  severity: "error" | "warning";
}

export interface DiagnosticsResult {
  hasErrors: boolean;
  issues: DiagnosticIssue[];
  formatted: string[];
}

const TSC_TIMEOUT_MS = 4_000;
const PYTHON_TIMEOUT_MS = 2_500;

/**
 * Find the closest tsconfig.json climbing up from startPath.
 */
export function findNearestTsConfig(startPath: string, rootLimit?: string): string | null {
  let current = path.resolve(fs.statSync(startPath, { throwIfNoEntry: false })?.isDirectory() ? startPath : path.dirname(startPath));
  const limit = rootLimit ? path.resolve(rootLimit) : path.parse(current).root;

  for (let i = 0; i < 20; i++) {
    const candidate = path.join(current, "tsconfig.json");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    if (current === limit) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

/**
 * Fast in-process syntax verification using Bun.Transpiler.
 * Runs in <1ms without spawning external processes.
 */
function checkSyntaxWithBun(filePath: string, content: string): DiagnosticIssue[] {
  const ext = path.extname(filePath).toLowerCase();
  let loader: "ts" | "tsx" | "js" | "jsx";

  if (ext === ".tsx") loader = "tsx";
  else if (ext === ".ts") loader = "ts";
  else if (ext === ".jsx") loader = "jsx";
  else if ([".js", ".mjs", ".cjs"].includes(ext)) loader = "js";
  else return [];

  try {
    new Bun.Transpiler({ loader }).transformSync(content);
    return [];
  } catch (err: any) {
    const message = err?.message || String(err);
    const lineMatch = message.match(/:(\d+):(\d+)/);
    return [
      {
        file: filePath,
        line: lineMatch ? Number(lineMatch[1]) : undefined,
        column: lineMatch ? Number(lineMatch[2]) : undefined,
        message: `Syntax error: ${message}`,
        severity: "error",
      },
    ];
  }
}

/**
 * Verify JSON validity via JSON.parse.
 */
function checkJsonSyntax(filePath: string, content: string): DiagnosticIssue[] {
  try {
    JSON.parse(content);
    return [];
  } catch (err: any) {
    return [
      {
        file: filePath,
        message: `JSON syntax error: ${err.message}`,
        severity: "error",
      },
    ];
  }
}

/**
 * Run TypeScript compiler type-checking on project with timeout.
 */
async function checkTypeScriptDiagnostics(
  filePath: string,
  tsconfigPath: string,
  projectRoot: string,
): Promise<DiagnosticIssue[]> {
  const issues: DiagnosticIssue[] = [];
  const normalizedTarget = path.resolve(filePath).toLowerCase();
  const targetBaseName = path.basename(filePath).toLowerCase();

  try {
    const proc = Bun.spawn(["bun", "run", "tsc", "--noEmit", "--project", tsconfigPath], {
      cwd: path.dirname(tsconfigPath),
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), TSC_TIMEOUT_MS),
    );

    const runPromise = (async () => {
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      await proc.exited;
      return `${stdout}\n${stderr}`;
    })();

    const raceResult = await Promise.race([runPromise, timeoutPromise]);

    if (raceResult === "timeout") {
      try {
        proc.kill();
      } catch {}
      return [];
    }

    const output = raceResult;
    const lines = output.split("\n");

    for (const line of lines) {
      // Formats:
      // 1) path/to/file.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.
      // 2) path/to/file.ts:12:5 - error TS2322: Type 'string' is not assignable to type 'number'.
      const m1 = line.match(/^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s*(TS\d+)?:\s*(.+)$/i);
      const m2 = line.match(/^(.+?):(\d+):(\d+)\s*-\s*(error|warning)\s*(TS\d+)?:\s*(.+)$/i);
      const match = m1 || m2;

      if (!match) continue;

      const rawFile = match[1]!.trim();
      const lineNum = Number(match[2]);
      const colNum = Number(match[3]);
      const severity = match[4]!.toLowerCase() as "error" | "warning";
      const code = match[5]?.trim();
      const message = match[6]!.trim();

      const resolvedErrorFile = path.resolve(path.dirname(tsconfigPath), rawFile).toLowerCase();

      // Only report diagnostics for the file that was modified
      if (
        resolvedErrorFile === normalizedTarget ||
        path.basename(resolvedErrorFile) === targetBaseName
      ) {
        issues.push({
          file: filePath,
          line: lineNum,
          column: colNum,
          code,
          message,
          severity,
        });
      }
    }
  } catch {
    // Non-fatal: compiler unavailable or crashed
  }

  return issues;
}

/**
 * Check Python syntax via python -m py_compile.
 */
async function checkPythonSyntax(filePath: string): Promise<DiagnosticIssue[]> {
  try {
    const proc = Bun.spawn(["python", "-m", "py_compile", filePath], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), PYTHON_TIMEOUT_MS),
    );

    const runPromise = (async () => {
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      return { exitCode, stderr };
    })();

    const result = await Promise.race([runPromise, timeoutPromise]);
    if (result === "timeout") {
      try {
        proc.kill();
      } catch {}
      return [];
    }

    if (result.exitCode !== 0 && result.stderr.trim()) {
      const lineMatch = result.stderr.match(/line (\d+)/i);
      return [
        {
          file: filePath,
          line: lineMatch ? Number(lineMatch[1]) : undefined,
          message: result.stderr.trim().split("\n").slice(-2).join(" ").trim(),
          severity: "error",
        },
      ];
    }
  } catch {
    // Python not installed or command failed
  }
  return [];
}

/**
 * Run diagnostic checks on a target file after it has been written or edited.
 * Catches syntax errors, compiler issues, or parse errors and returns a formatted report.
 *
 * @param targetFilePath Absolute or relative path to the modified file
 * @param projectRoot Root directory of the project
 */
export async function runDiagnostics(
  targetFilePath: string,
  projectRoot: string = process.cwd(),
): Promise<DiagnosticsResult> {
  const absolutePath = path.resolve(projectRoot, targetFilePath);

  if (!fs.existsSync(absolutePath)) {
    return { hasErrors: false, issues: [], formatted: [] };
  }

  let content: string;
  try {
    content = fs.readFileSync(absolutePath, "utf8");
  } catch {
    return { hasErrors: false, issues: [], formatted: [] };
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const relPath = path.relative(projectRoot, absolutePath) || path.basename(absolutePath);
  const issues: DiagnosticIssue[] = [];

  // 1. JSON check
  if (ext === ".json") {
    issues.push(...checkJsonSyntax(relPath, content));
  }
  // 2. TypeScript / JavaScript check
  else if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    // 2A: Instant in-process syntax check
    const syntaxIssues = checkSyntaxWithBun(relPath, content);
    issues.push(...syntaxIssues);

    // 2B: If syntax is clean and it's TypeScript, run type-checking if tsconfig exists
    if (syntaxIssues.length === 0 && (ext === ".ts" || ext === ".tsx")) {
      const tsconfig = findNearestTsConfig(absolutePath, projectRoot);
      if (tsconfig) {
        const typeIssues = await checkTypeScriptDiagnostics(relPath, tsconfig, projectRoot);
        issues.push(...typeIssues);
      }
    }
  }
  // 3. Python check
  else if (ext === ".py") {
    issues.push(...(await checkPythonSyntax(absolutePath)));
  }

  // Format issues into concise, readable strings for the LLM turn
  const formatted = issues.map((issue) => {
    const loc = issue.line ? `:${issue.line}${issue.column ? `:${issue.column}` : ""}` : "";
    const code = issue.code ? ` [${issue.code}]` : "";
    return `${issue.file}${loc} - ${issue.severity.toUpperCase()}${code}: ${issue.message}`;
  });

  return {
    hasErrors: issues.some((i) => i.severity === "error"),
    issues,
    formatted,
  };
}
