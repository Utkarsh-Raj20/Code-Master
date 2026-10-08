import { useState, useRef, useCallback } from "react";
import { TextAttributes, type InputRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useTheme } from "../providers/theme";
import { useToast } from "../providers/toast";
import { Header } from "../components/header";
import { saveKey, hasAnyKey } from "../lib/key-store";
import { validateKey } from "../lib/key-validator";
import { PROVIDER_INFO, type SupportedProvider } from "@mastercode/shared";

type Props = {
  onComplete: () => void;
};

const PROVIDERS: SupportedProvider[] = [
  "anthropic",
  "openai",
  "gemini",
  "groq",
  "openrouter",
  "deepseek",
];

export function Setup({ onComplete }: Props) {
  const [providerIndex, setProviderIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<InputRenderable>(null);
  const { colors } = useTheme();
  const toast = useToast();

  const currentProvider = PROVIDERS[providerIndex] ?? "anthropic";
  const currentInfo = PROVIDER_INFO[currentProvider];

  const handleNextProvider = useCallback(() => {
    setProviderIndex((i) => (i + 1) % PROVIDERS.length);
    setErrorMessage(null);
  }, []);

  const handlePrevProvider = useCallback(() => {
    setProviderIndex((i) => (i - 1 + PROVIDERS.length) % PROVIDERS.length);
    setErrorMessage(null);
  }, []);

  const handleSaveAndContinue = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setErrorMessage("Please enter an API key to continue");
      return;
    }

    setIsValidating(true);
    setErrorMessage(null);

    try {
      const result = await validateKey(currentProvider, trimmed);
      if (!result.valid) {
        setErrorMessage(result.error || "Key validation failed");
        setIsValidating(false);
        return;
      }

      saveKey(currentProvider, trimmed);
      toast.show({
        variant: "success",
        message: `Connected ${currentInfo?.name || currentProvider}!`,
      });
      onComplete();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Validation error");
    } finally {
      setIsValidating(false);
    }
  }, [inputValue, currentProvider, currentInfo, onComplete, toast]);

  useKeyboard((key) => {
    if (isValidating) return;

    if (key.name === "tab") {
      key.preventDefault();
      handleNextProvider();
    } else if (key.name === "return" || key.name === "enter") {
      void handleSaveAndContinue();
    }
  });

  return (
    <box
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
      position="relative"
      width="100%"
      height="100%"
      gap={1}
    >
      <Header />

      <box
        width="100%"
        maxWidth={72}
        paddingX={3}
        paddingY={1}
        flexDirection="column"
        backgroundColor={colors.surface}
        gap={1}
      >
        <text attributes={TextAttributes.BOLD}>Welcome to Mastercode!</text>
        <text attributes={TextAttributes.DIM}>
          Mastercode uses Bring Your Own Key (BYOK). Your keys are stored encrypted on
          your machine and never uploaded to our servers.
        </text>

        <box flexDirection="column" gap={1} marginTop={1}>
          <box flexDirection="row" gap={1} alignItems="center">
            <text attributes={TextAttributes.DIM}>Provider (press Tab to cycle):</text>
            <text attributes={TextAttributes.BOLD} fg={colors.primary}>
              ‹ {currentInfo?.name || currentProvider} ›
            </text>
          </box>

          <box flexDirection="column" gap={0}>
            <text attributes={TextAttributes.DIM}>Get an API key here:</text>
            <text fg={colors.primary}>{currentInfo?.docsUrl}</text>
          </box>

          <box flexDirection="column" gap={0} marginTop={1}>
            <text>API Key:</text>
            <input
              ref={inputRef}
              placeholder={currentInfo?.placeholder || "Enter your API key..."}
              focused
              onContentChange={() => {
                const val = inputRef.current?.value ?? "";
                setInputValue(val);
                setErrorMessage(null);
              }}
            />
          </box>

          {isValidating && (
            <text fg={colors.primary}>Validating key with {currentInfo?.name}...</text>
          )}

          {errorMessage && (
            <text fg="red">{errorMessage}</text>
          )}

          <box
            flexDirection="row"
            justifyContent="space-between"
            marginTop={1}
            border={["top"]}
            paddingTop={1}
          >
            <text attributes={TextAttributes.DIM}>
              [Enter] Save &amp; Continue   [Tab] Switch Provider
            </text>
            <text
              attributes={TextAttributes.DIM}
              onMouseDown={() => onComplete()}
            >
              Skip
            </text>
          </box>
        </box>
      </box>
    </box>
  );
}
