import { SUPPORTED_CHAT_MODELS } from "@mastercode/shared";
import {
  AgentsDialogContent,
  KeysDialogContent,
  ModelsDialogContent,
  SessionsDialogContent,
  SkillsDialogContent,
  ThemeDialogContent,
} from "../dialogs";
import type { Command } from "./types";
import { apiClient } from "../../lib/api-client";
import { CheckpointManager } from "../../lib/checkpoint-manager";
import { CostTracker } from "../../lib/cost-tracker";
import { SkillManager } from "../../lib/skill-manager";
import { McpManager } from "../../lib/mcp-manager";
import { AgentLogger } from "../../lib/agent-logger";

export const COMMANDS: Command[] = [
  {
    name: "new",
    description: "Start a new conversation",
    value: "/new",
    action: (ctx) => {
      ctx.navigate("/");
    },
  },
  {
    name: "init",
    description: "Initialize project instructions (<project>.md)",
    value: "/init",
    action: async (ctx) => {
      ctx.toast.show({
        message: "Analyzing project and generating instructions...",
        variant: "info",
      });
      try {
        const res = await apiClient.init.$post({
          json: { model: ctx.model },
        });
        const data = await res.json();
        if (!res.ok) {
          ctx.toast.show({
            message: `Init failed: ${"error" in data ? (data as any).error : "Unknown error"}`,
            variant: "error",
          });
          return;
        }
        const fileName = (data as any).filePath
          ? (data as any).filePath.split(/[\\/]/).pop()
          : "project instructions";
        ctx.toast.show({
          message: (data as any).existed
            ? `Updated ${fileName} successfully!`
            : `Created ${fileName} successfully!`,
          variant: "success",
        });
      } catch (err) {
        ctx.toast.show({
          message: `Init failed: ${err instanceof Error ? err.message : String(err)}`,
          variant: "error",
        });
      }
    },
  },
  {
    name: "agents",
    description: "Switch agents",
    value: "/agents",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Select Agent",
        children: <AgentsDialogContent currentMode={ctx.mode} onSelectMode={ctx.setMode} />,
      });
    },
  },
  {
    name: "model",
    description: "Select AI model for generation",
    value: "/model",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Select Model",
        children: (
          <ModelsDialogContent
            models={SUPPORTED_CHAT_MODELS.map((model) => model.id)}
            onSelectModel={ctx.setModel}
          />
        ),
      });
    },
  },
  {
    name: "keys",
    description: "Manage AI provider API keys",
    value: "/keys",
    action: (ctx) => {
      ctx.dialog.open({
        title: "API Keys",
        children: <KeysDialogContent />,
      });
    },
  },
  {
    name: "sessions",
    description: "Browse past sessions",
    value: "/sessions",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Sessions",
        children: <SessionsDialogContent />,
      });
    },
  },
  {
    name: "theme",
    description: "Change color theme",
    value: "/theme",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Select Theme",
        children: <ThemeDialogContent />,
      });
    },
  },
  {
    name: "optimize",
    description: "Toggle prompt optimization (rewrite prompts with a fast LLM before sending)",
    value: "/optimize",
    action: (ctx) => {
      ctx.toggleOptimizePrompt();
      const next = !ctx.optimizePrompt;
      ctx.toast.show({
        message: next
          ? "✨ Prompt optimization ON — prompts will be rewritten for clarity"
          : "Prompt optimization OFF — prompts sent verbatim",
        variant: next ? "success" : "info",
      });
    },
  },
  {
    name: "undo",
    description: "Roll back the last file edits",
    value: "/undo",
    action: async (ctx) => {
      const result = await CheckpointManager.rollbackLastStep();
      if (!result.stepId || result.restoredFiles.length === 0) {
        ctx.toast.show({ message: "No edits to undo", variant: "info" });
        return;
      }
      const names = result.restoredFiles.map(
        (filePath) => filePath.split(/[\\/]/).pop() ?? filePath,
      );
      ctx.toast.show({
        message: `Restored ${result.restoredFiles.length} file${
          result.restoredFiles.length === 1 ? "" : "s"
        }: ${names.join(", ")}`,
        variant: "success",
      });
    },
  },
  {
    name: "cost",
    description: "Show session token usage, cache savings and estimated cost",
    value: "/cost",
    action: (ctx) => {
      const summary = CostTracker.getSummary();
      const cachedPart =
        summary.totalCachedTokens > 0
          ? ` (cached: ${summary.totalCachedTokens.toLocaleString()})`
          : "";
      ctx.toast.show({
        message: `Tokens: ${CostTracker.formatTokens()}${cachedPart} | Cost: ${CostTracker.formatCost()} | Turns: ${summary.turnsCount}`,
        variant: "info",
      });
    },
  },
  {
    name: "skills",
    description: "Browse and inspect available skills",
    value: "/skills",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Available Skills",
        width: 68,
        children: <SkillsDialogContent />,
      });
    },
  },
  {
    name: "mcp",
    description: "Show MCP server connection status",
    value: "/mcp",
    action: async (ctx) => {
      const statuses = await McpManager.refresh();
      if (statuses.length === 0) {
        ctx.toast.show({ message: "No MCP servers configured", variant: "info" });
        return;
      }
      const summary = statuses
        .map((server) =>
          server.status === "connected"
            ? `● ${server.name} Connected (${server.toolCount} tools)`
            : `○ ${server.name} Failed`,
        )
        .join(" • ");
      ctx.toast.show({ message: summary, variant: "info" });
    },
  },
  {
    name: "logs",
    description: "Show agent log file location and recent diagnostic errors",
    value: "/logs",
    action: (ctx) => {
      const logPath = AgentLogger.currentLogPath();
      const lastError = AgentLogger.getLastError();
      if (lastError) {
        ctx.toast.show({
          message: `Logs: ${logPath} | Last error: ${lastError}`,
          variant: "error",
        });
      } else {
        ctx.toast.show({
          message: `Logs: ${logPath} (no errors recorded today)`,
          variant: "info",
        });
      }
    },
  },
  {
    name: "exit",
    description: "Quit the application",
    value: "/exit",
    action: (ctx) => {
      ctx.exit();
    },
  },
];
