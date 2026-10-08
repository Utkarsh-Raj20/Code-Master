import { SUPPORTED_CHAT_MODELS } from "@mastercode/shared";
import { 
  AgentsDialogContent,
  KeysDialogContent,
  ModelsDialogContent,
  SessionsDialogContent,
  ThemeDialogContent,
} from "../dialogs";
import type { Command } from "./types";
import { apiClient } from "../../lib/api-client";

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
    description: "Initialize .mastercode.md project instructions",
    value: "/init",
    action: async (ctx) => {
      ctx.toast.show({
        message: "Analyzing project and generating .mastercode.md...",
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
        ctx.toast.show({
          message: (data as any).existed
            ? "Updated .mastercode.md successfully!"
            : "Created .mastercode.md successfully!",
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
    name: "models",
    description: "Select AI model for generation",
    value: "/models",
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
    // Alias: /model → opens same model picker (matches Claude Code's /model command)
    name: "model",
    description: "Switch model mid-session",
    value: "/model",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Switch Model",
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
    // Alias: /rewrite → same toggle
    name: "rewrite",
    description: "Alias for /optimize — toggle prompt rewriting",
    value: "/rewrite",
    action: (ctx) => {
      ctx.toggleOptimizePrompt();
      const next = !ctx.optimizePrompt;
      ctx.toast.show({
        message: next
          ? "✨ Prompt optimization ON"
          : "Prompt optimization OFF",
        variant: next ? "success" : "info",
      });
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
