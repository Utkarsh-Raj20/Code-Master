import { useState } from "react";
import { TextAttributes } from "@opentui/core";
import type { ThemeColors } from "../../theme";
import type { Message } from "../../hooks/use-chat";
import { DiffViewer } from "./diff-viewer";

type ClientMessagePart = Message["parts"][number];

export type ToolPart = Extract<
  ClientMessagePart,
  { type: `tool-${string}` | "dynamic-tool" }
>;

type Props = {
  part: ToolPart;
  colors: ThemeColors;
};

function formatToolName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function toolNameOf(part: ToolPart): string {
  if (part.type === "dynamic-tool") {
    return (part as { toolName: string }).toolName;
  }
  return part.type.slice("tool-".length);
}

function parseMcpName(name: string): { server: string; tool: string } | null {
  if (!name.startsWith("mcp__")) return null;
  const rest = name.slice("mcp__".length);
  const sep = rest.indexOf("__");
  if (sep <= 0) return null;
  return { server: rest.slice(0, sep), tool: rest.slice(sep + 2) };
}

function summarizeArgs(part: ToolPart): string {
  const input = (part as { input?: unknown }).input;
  if (input == null) return "";
  if (typeof input === "string") return input;
  if (typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (typeof record.path === "string") return record.path;
    if (typeof record.command === "string") return record.command;
    return Object.values(record).map(String).join(" ");
  }
  return String(input);
}

function stringifyOutput(part: ToolPart): string {
  const output = (part as { output?: unknown }).output;
  if (output == null) return "";
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function editFileDiff(
  part: ToolPart,
): { oldText: string; newText: string; filePath: string } | null {
  if (toolNameOf(part) !== "editFile") return null;
  const input = (part as { input?: unknown }).input;
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (typeof record.oldString !== "string" || typeof record.newString !== "string") {
    return null;
  }
  return {
    oldText: record.oldString,
    newText: record.newString,
    filePath: typeof record.path === "string" ? record.path : "",
  };
}

export function ToolAccordion({ part, colors }: Props) {
  const [expanded, setExpanded] = useState(false);
  const state = part.state as string | undefined;
  const isError = state === "output-error";
  const isDone = state === "output-available";
  const isRunning = !isError && !isDone;

  const rawName = toolNameOf(part);
  const mcp = parseMcpName(rawName);
  const name = formatToolName(mcp ? mcp.tool : rawName);
  const args = summarizeArgs(part);
  const argsText = args ? ` (${args})` : "";
  const diff = editFileDiff(part);

  let glyph: string;
  let status: string;
  let color: string;
  if (isError) {
    glyph = "✗";
    status = "ERROR";
    color = colors.error;
  } else if (isDone) {
    glyph = "✓";
    status = "DONE";
    color = colors.success;
  } else {
    glyph = "⟳";
    status = "RUNNING";
    color = colors.info;
  }

  return (
    <box flexDirection="column" width="100%" paddingLeft={2}>
      <box flexDirection="row" gap={1} onMouseDown={() => setExpanded((v) => !v)}>
        <text fg={color}>{expanded ? "▼" : "▶"}</text>
        <text fg={color}>{glyph}</text>
        {mcp ? <text fg={color}>[MCP: {mcp.server}]</text> : null}
        <text fg={color}>{name}</text>
        {argsText ? <text attributes={TextAttributes.DIM}>{argsText}</text> : null}
        <text fg={color}>[{status}]</text>
      </box>
      {expanded && (
        <box flexDirection="column" paddingLeft={2}>
          {isError ? (
            <text fg={colors.error}>
              {(part as { errorText?: string }).errorText ?? "Unknown error"}
            </text>
          ) : diff ? (
            <DiffViewer oldText={diff.oldText} newText={diff.newText} filePath={diff.filePath} />
          ) : (
            <text>{stringifyOutput(part)}</text>
          )}
        </box>
      )}
    </box>
  );
}
