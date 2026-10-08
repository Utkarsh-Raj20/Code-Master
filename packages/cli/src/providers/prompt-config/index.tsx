import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { 
  DEFAULT_CHAT_MODEL_ID, 
  Mode,
  type ModeType,
  type SupportedChatModelId,
} from "@mastercode/shared";

type PromptConfigContextValue = {
  mode: ModeType;
  toggleMode: () => void;
  setMode: (mode: ModeType) => void;
  model: SupportedChatModelId;
  setModel: (model: SupportedChatModelId) => void;
  optimizePrompt: boolean;
  toggleOptimizePrompt: () => void;
};

const PromptConfigContext = createContext<PromptConfigContextValue | null>(null);

export function usePromptConfig(): PromptConfigContextValue {
  const value = useContext(PromptConfigContext);
  if (!value) {
    throw new Error("usePromptConfig must be used within a PromptConfigProvider");
  }
  return value;
};

type PromptConfigProviderProps = {
  children: ReactNode;
};

export function PromptConfigProvider({ children }: PromptConfigProviderProps) {
  const [mode, setMode] = useState<ModeType>(Mode.BUILD);
  const [model, setModel] = useState<SupportedChatModelId>(DEFAULT_CHAT_MODEL_ID);
  const [optimizePrompt, setOptimizePrompt] = useState<boolean>(true);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === Mode.BUILD ? Mode.PLAN : Mode.BUILD));
  }, []);

  const toggleOptimizePrompt = useCallback(() => {
    setOptimizePrompt((v) => !v);
  }, []);

  return (
    <PromptConfigContext.Provider 
      value={{ 
        mode, 
        toggleMode, 
        setMode, 
        model, 
        setModel,
        optimizePrompt,
        toggleOptimizePrompt,
    }}>
      {children}
    </PromptConfigContext.Provider>
  );
};
