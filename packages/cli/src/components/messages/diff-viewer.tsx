import { TextAttributes } from "@opentui/core";
import { useTheme } from "../../providers/theme";

type DiffOp = {
  kind: "context" | "add" | "del";
  text: string;
};

type DiffLine = {
  kind: "hunk" | "context" | "add" | "del";
  text: string;
};

const CONTEXT_LINES = 3;
const MAX_DIFF_CELLS = 250_000;

function computeOps(oldLines: string[], newLines: string[]): DiffOp[] {
  const m = oldLines.length;
  const n = newLines.length;

  // Pathological fallback: whole-file replacement when the grid is too large.
  if (m * n > MAX_DIFF_CELLS) {
    const ops: DiffOp[] = [];
    for (const line of oldLines) ops.push({ kind: "del", text: line });
    for (const line of newLines) ops.push({ kind: "add", text: line });
    return ops;
  }

  // Longest-common-subsequence dynamic programming table.
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i]![j] = dp[i + 1]![j + 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      }
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ kind: "context", text: oldLines[i]! });
      i++;
      j++;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      ops.push({ kind: "del", text: oldLines[i]! });
      i++;
    } else {
      ops.push({ kind: "add", text: newLines[j]! });
      j++;
    }
  }
  while (i < m) {
    ops.push({ kind: "del", text: oldLines[i]! });
    i++;
  }
  while (j < n) {
    ops.push({ kind: "add", text: newLines[j]! });
    j++;
  }

  return ops;
}

function buildUnifiedDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const ops = computeOps(oldLines, newLines);

  if (ops.every((op) => op.kind === "context")) return [];

  const n = ops.length;
  const isChange = ops.map((op) => op.kind !== "context");
  const included = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    if (isChange[i]) included[i] = true;
  }

  // Expand hunks with up to CONTEXT_LINES of surrounding context.
  for (let i = 0; i < n; i++) {
    if (!isChange[i]) continue;
    for (let k = 1; k <= CONTEXT_LINES; k++) {
      if (i - k >= 0 && ops[i - k]!.kind === "context") included[i - k] = true;
      if (i + k < n && ops[i + k]!.kind === "context") included[i + k] = true;
    }
  }

  const result: DiffLine[] = [];
  let oldLineNo = 1;
  let newLineNo = 1;
  let i = 0;

  while (i < n) {
    if (!included[i]) {
      if (ops[i]!.kind === "del") oldLineNo++;
      else if (ops[i]!.kind === "add") newLineNo++;
      else {
        oldLineNo++;
        newLineNo++;
      }
      i++;
      continue;
    }

    const start = i;
    while (i < n && included[i]) i++;
    const end = i;

    const hunkOldStart = oldLineNo;
    const hunkNewStart = newLineNo;
    let hunkOldCount = 0;
    let hunkNewCount = 0;
    const hunkLines: DiffLine[] = [];

    for (let k = start; k < end; k++) {
      const op = ops[k]!;
      if (op.kind === "del") {
        hunkLines.push({ kind: "del", text: `-${op.text}` });
        hunkOldCount++;
        oldLineNo++;
      } else if (op.kind === "add") {
        hunkLines.push({ kind: "add", text: `+${op.text}` });
        hunkNewCount++;
        newLineNo++;
      } else {
        hunkLines.push({ kind: "context", text: ` ${op.text}` });
        hunkOldCount++;
        hunkNewCount++;
        oldLineNo++;
        newLineNo++;
      }
    }

    result.push({
      kind: "hunk",
      text: `@@ -${hunkOldStart},${hunkOldCount} +${hunkNewStart},${hunkNewCount} @@`,
    });
    result.push(...hunkLines);
  }

  return result;
}

export function DiffViewer({
  oldText,
  newText,
  filePath,
}: {
  oldText: string;
  newText: string;
  filePath: string;
}) {
  const { colors } = useTheme();
  const lines = buildUnifiedDiff(oldText, newText);

  if (lines.length === 0) {
    return (
      <text attributes={TextAttributes.DIM}>No changes — {filePath}</text>
    );
  }

  return (
    <box flexDirection="column" paddingLeft={2}>
      <text fg="cyan">
        diff --git a/{filePath} b/{filePath}
      </text>
      {lines.map((line, i) => {
        if (line.kind === "hunk") {
          return (
            <text key={i} fg="cyan">
              {line.text}
            </text>
          );
        }
        if (line.kind === "add") {
          return (
            <text key={i} fg={colors.success}>
              {line.text}
            </text>
          );
        }
        if (line.kind === "del") {
          return (
            <text key={i} fg={colors.error}>
              {line.text}
            </text>
          );
        }
        return (
          <text key={i} attributes={TextAttributes.DIM}>
            {line.text}
          </text>
        );
      })}
    </box>
  );
}
