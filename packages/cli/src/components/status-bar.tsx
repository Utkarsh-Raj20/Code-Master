import { useEffect, useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "../providers/theme";
import { usePromptConfig } from "../providers/prompt-config";
import { Mode } from "@mastercode/shared";
import { getProjectConfigPath } from "../lib/project-config";
import { CostTracker } from "../lib/cost-tracker";
import path from "node:path";

export function StatusBar() {
  const { mode, model, optimizePrompt } = usePromptConfig();
  const { colors } = useTheme();

  // Lightweight heartbeat so the cost HUD stays live during a session.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const configPath = getProjectConfigPath();
  const cwdName = path.basename(process.cwd());
  const projectLabel = configPath
    ? `📄 ${path.basename(configPath)}`
    : null;

  // Clean, uncluttered cost formatting
  const summary = CostTracker.getSummary();
  const costLabel =
    summary.totalTokens > 0
      ? `${CostTracker.formatTokens()} tok · ${CostTracker.formatCost()}`
      : CostTracker.formatCost();

  // Strip verbose timestamp suffixes if present (e.g. -20250219)
  const displayModel = model.replace(/-20\d{6}$/, "");

  return (
    <box flexDirection="row" justifyContent="space-between" width="100%">
      {/* Left: Project Context & Agent Mode */}
      <box flexDirection="row" gap={1}>
        <text attributes={TextAttributes.DIM} fg={colors.info}>
          📁 {cwdName}
        </text>

        <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
          ›
        </text>

        <text fg={mode === Mode.PLAN ? colors.planMode : colors.primary}>
          {mode === Mode.PLAN ? "Plan" : "Build"}
        </text>

        <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
          ›
        </text>

        <text attributes={TextAttributes.DIM}>{displayModel}</text>
      </box>

      {/* Right: Telemetry, Project Doc & Active Toggles */}
      <box flexDirection="row" gap={1} flexShrink={0}>
        {projectLabel && (
          <>
            <text attributes={TextAttributes.DIM} fg="cyan">
              {projectLabel}
            </text>
            <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
              ›
            </text>
          </>
        )}

        <text attributes={TextAttributes.DIM}>{costLabel}</text>

        {optimizePrompt && (
          <>
            <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
              ›
            </text>
            <text fg="green">✨ opt</text>
          </>
        )}
      </box>
    </box>
  );
};
