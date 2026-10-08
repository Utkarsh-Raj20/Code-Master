import { TextAttributes } from "@opentui/core";
import { useTheme } from "../providers/theme";
import { usePromptConfig } from "../providers/prompt-config";
import { Mode } from "@mastercode/shared";
import { getProjectConfigPath } from "../lib/project-config";
import path from "node:path";

export function StatusBar() {
  const { mode, model, optimizePrompt } = usePromptConfig();
  const { colors } = useTheme();

  const configPath = getProjectConfigPath();
  const projectLabel = configPath
    ? `📄 ${path.basename(path.dirname(configPath))}/${path.basename(configPath)}`
    : null;

  return (
    <box flexDirection="row" gap={1}>
      
      <text fg={mode === Mode.PLAN ? colors.planMode : colors.primary}>
        {mode === Mode.PLAN ? "Plan" : "Build"}
      </text>

      <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
        ›
      </text>
      <text>{model}</text>

      <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
        ›
      </text>
      {optimizePrompt ? (
        <text fg={"green"}>✨ opt:on</text>
      ) : (
        <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>opt:off</text>
      )}

      {projectLabel && (
        <>
          <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
            ›
          </text>
          <text attributes={TextAttributes.DIM} fg={"cyan"}>
            {projectLabel}
          </text>
        </>
      )}
    </box>
  );
};
