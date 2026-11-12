import prettyMs from "pretty-ms";
import { EmptyBorder } from "../border";
import { useTheme } from "../../providers/theme";
import type { Message } from "../../hooks/use-chat";
import { Mode, type ModeType } from "@mastercode/shared";
import { TextAttributes } from "@opentui/core";
import { ToolAccordion } from "./tool-accordion";
import type { ToolPart } from "./tool-accordion";
import { useState } from "react";

type ClientMessagePart = Message["parts"][number];

type Props = {
  parts: ClientMessagePart[];
  model: string;
  mode: ModeType;
  durationMs?: number;
  fallbackNotice?: string;
  pipelineNotice?: string;
  promptOptimization?: { original: string; optimized: string };
  streaming?: boolean;
};

function isToolPart(part: ClientMessagePart): part is ToolPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
};

type PartGroup = {
  type: ClientMessagePart["type"];
  parts: ClientMessagePart[];
  key: string;
};

function groupConsecutiveParts(parts: ClientMessagePart[]): PartGroup[] {
  const groups: PartGroup[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const lastGroup = groups[groups.length - 1];

     if (lastGroup && lastGroup.type === part.type) {
      lastGroup.parts.push(part);
     } else {
      const key = 
        isToolPart(part) ? `group-tc-${part.toolCallId}` : `group-${part.type}-${i}`;
      groups.push({ type: part.type, parts: [part], key });
     }
  }

  return groups;
};

function PromptOptimizationBlock({
  original,
  optimized,
}: {
  original: string;
  optimized: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { colors } = useTheme();

  return (
    <box
      flexDirection="column"
      paddingX={3}
      paddingBottom={1}
      width="100%"
      gap={1}
    >
      {/* Header row */}
      <box
        flexDirection="row"
        gap={1}
        onMouseDown={() => setExpanded((v) => !v)}
      >
        <text fg="green">✨</text>
        <text fg="green" attributes={TextAttributes.BOLD}>
          Prompt optimized
        </text>
        <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>
          {expanded ? "▲ hide" : "▼ show original"}
        </text>
      </box>

      {/* Expanded: show before → after */}
      {expanded && (
        <box flexDirection="column" gap={1} width="100%">
          {/* Original */}
          <box flexDirection="column" gap={0}>
            <text fg="yellow" attributes={TextAttributes.DIM}>
              Before:
            </text>
            <box
              paddingX={2}
              border={["left"]}
              borderColor="yellow"
              customBorderChars={{
                ...EmptyBorder,
                vertical: "│",
              }}
              width="100%"
            >
              <text attributes={TextAttributes.DIM}>{original}</text>
            </box>
          </box>

          {/* Optimized */}
          <box flexDirection="column" gap={0}>
            <text fg="green" attributes={TextAttributes.DIM}>
              After:
            </text>
            <box
              paddingX={2}
              border={["left"]}
              borderColor="green"
              customBorderChars={{
                ...EmptyBorder,
                vertical: "│",
              }}
              width="100%"
            >
              <text>{optimized}</text>
            </box>
          </box>
        </box>
      )}
    </box>
  );
}

export function BotMessage({ 
  parts,
  model,
  mode,
  durationMs,
  fallbackNotice,
  pipelineNotice,
  promptOptimization,
  streaming = false,
}: Props) {
  const { colors } = useTheme();
  return (
    <box width="100%" alignItems="center">
      {fallbackNotice && (
        <box paddingX={3} paddingY={0} width="100%">
          <text fg="yellow">{fallbackNotice}</text>
        </box>
      )}
      {/* Show rich optimization block if we have before/after, else plain notice */}
      {promptOptimization ? (
        <PromptOptimizationBlock
          original={promptOptimization.original}
          optimized={promptOptimization.optimized}
        />
      ) : (
        pipelineNotice && (
          <box paddingX={3} paddingY={0} width="100%">
            <text fg="green">{pipelineNotice}</text>
          </box>
        )
      )}
      {groupConsecutiveParts(parts).map((group, i) => (
        <box key={group.key} width="100%" paddingTop={i === 0 ? 0 : 1}>
          {group.parts.map((part, j) => {
            if (part.type === "reasoning") {
              return (
                <box
                  key={`reasoning-${j}`}
                  border={["left"]}
                  borderColor={colors.thinkingBorder}
                  customBorderChars={{
                    ...EmptyBorder,
                    vertical: "│",
                  }}
                  width="100%"
                  paddingX={2}
                >
                  <text attributes={TextAttributes.DIM}>
                    <em fg={colors.thinking}>Thinking:</em> {part.text}
                  </text>
                </box>
              );
            }

            if (isToolPart(part)) {
              return <ToolAccordion key={part.toolCallId} part={part} colors={colors} />;
            }

            if (part.type === "text") {
              return (
                <box key={`text-${j}`} paddingX={3} width="100%">
                  <text>{part.text}</text>
                </box>
              );
            }
            
            return null;
          })}
        </box>
      ))}

      <box paddingX={3} paddingY={1} gap={1} width="100%">
        <box flexDirection="row" gap={2}>
          <text fg={mode === Mode.PLAN ? colors.planMode : colors.primary}>◉</text>
          <box flexDirection="row" gap={1}>
            <text>
              {mode === Mode.PLAN ? "Plan" : "Build"}
            </text>
            <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
              ›
            </text>
            <text attributes={TextAttributes.DIM}>{model}</text>
            {(durationMs != null) && (
              <>
                <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
                  ›
                </text>
                <text attributes={TextAttributes.DIM}>
                  {prettyMs(durationMs)}
                </text>
              </>
            )}
          </box>
        </box>
      </box>
    </box>
  );
};
