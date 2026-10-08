import { useState, useRef, useCallback } from "react";
import { TextAttributes, type InputRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useKeyboardLayer } from "../../providers/keyboard-layer";
import { useDialog } from "../../providers/dialog";
import { useTheme } from "../../providers/theme";
import { useToast } from "../../providers/toast";
import {
  listKeys,
  saveKey,
  deleteKey,
  setActiveProvider,
  type StoredKeyInfo,
} from "../../lib/key-store";
import { validateKey } from "../../lib/key-validator";
import { PROVIDER_INFO, type SupportedProvider } from "@mastercode/shared";

type ViewMode = "list" | "edit";

export function KeysDialogContent() {
  const [keys, setKeys] = useState<StoredKeyInfo[]>(() => listKeys());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingProvider, setEditingProvider] = useState<SupportedProvider | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<InputRenderable>(null);
  const { isTopLayer } = useKeyboardLayer();
  const { colors } = useTheme();
  const dialog = useDialog();
  const toast = useToast();

  const refreshKeys = useCallback(() => {
    setKeys(listKeys());
  }, []);

  const selectedItem = keys[selectedIndex];

  const handleStartEdit = useCallback((provider: SupportedProvider) => {
    setEditingProvider(provider);
    setInputValue("");
    setErrorMessage(null);
    setViewMode("edit");
  }, []);

  const handleCancelEdit = useCallback(() => {
    setViewMode("list");
    setEditingProvider(null);
    setInputValue("");
    setErrorMessage(null);
  }, []);

  const handleSaveCurrentKey = useCallback(async () => {
    if (!editingProvider) return;
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setErrorMessage("API key cannot be empty");
      return;
    }

    setIsValidating(true);
    setErrorMessage(null);

    try {
      const result = await validateKey(editingProvider, trimmed);
      if (!result.valid) {
        setErrorMessage(result.error || "Key validation failed");
        setIsValidating(false);
        return;
      }

      saveKey(editingProvider, trimmed);
      refreshKeys();
      toast.show({
        variant: "success",
        message: `${PROVIDER_INFO[editingProvider]?.name || editingProvider} key saved!`,
      });
      setViewMode("list");
      setEditingProvider(null);
      setInputValue("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Validation error");
    } finally {
      setIsValidating(false);
    }
  }, [editingProvider, inputValue, refreshKeys, toast]);

  const handleDeleteCurrentKey = useCallback(
    (provider: SupportedProvider) => {
      deleteKey(provider);
      refreshKeys();
      toast.show({
        message: `Deleted key for ${PROVIDER_INFO[provider]?.name || provider}`,
      });
    },
    [refreshKeys, toast],
  );

  const handleToggleActive = useCallback(
    (provider: SupportedProvider) => {
      const item = keys.find((k) => k.provider === provider);
      if (!item?.isConfigured) {
        handleStartEdit(provider);
        return;
      }

      setActiveProvider(provider);
      refreshKeys();
      toast.show({
        variant: "success",
        message: `Active provider set to ${PROVIDER_INFO[provider]?.name || provider}`,
      });
    },
    [keys, handleStartEdit, refreshKeys, toast],
  );

  useKeyboard((key) => {
    if (!isTopLayer("dialog")) return;

    if (viewMode === "list") {
      if (key.name === "up") {
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (key.name === "down") {
        setSelectedIndex((i) => Math.min(keys.length - 1, i + 1));
      } else if (key.name === "return" || key.name === "enter") {
        if (selectedItem) {
          handleToggleActive(selectedItem.provider);
        }
      } else if (key.name === "a" || key.name === "A") {
        if (selectedItem) {
          handleStartEdit(selectedItem.provider);
        }
      } else if (key.name === "d" || key.name === "D") {
        if (selectedItem && selectedItem.isConfigured) {
          handleDeleteCurrentKey(selectedItem.provider);
        }
      }
    } else if (viewMode === "edit") {
      if (key.name === "escape") {
        handleCancelEdit();
      } else if (key.name === "return" || key.name === "enter") {
        void handleSaveCurrentKey();
      }
    }
  });

  if (viewMode === "edit" && editingProvider) {
    const info = PROVIDER_INFO[editingProvider];
    return (
      <box flexDirection="column" gap={1}>
        <text attributes={TextAttributes.BOLD}>
          Configure {info?.name || editingProvider} Key
        </text>

        <box flexDirection="column" gap={0}>
          <text attributes={TextAttributes.DIM}>Get your key from:</text>
          <text fg={colors.primary}>{info?.docsUrl}</text>
        </box>

        <box flexDirection="column" gap={0} marginTop={1}>
          <text>Enter API Key:</text>
          <input
            ref={inputRef}
            placeholder={info?.placeholder || "Enter key..."}
            focused
            onContentChange={() => {
              const val = inputRef.current?.value ?? "";
              setInputValue(val);
              setErrorMessage(null);
            }}
          />
        </box>

        {isValidating && (
          <text fg={colors.primary}>Validating key with provider...</text>
        )}

        {errorMessage && (
          <text fg="red">{errorMessage}</text>
        )}

        <box flexDirection="row" gap={2} marginTop={1}>
          <text attributes={TextAttributes.DIM}>
            [Enter] Save &amp; Validate   [Esc] Cancel
          </text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column" gap={0}>
        {keys.map((item, i) => {
          const isSelected = i === selectedIndex;
          const statusIcon = item.isActive ? "●" : item.isConfigured ? "○" : " ";
          return (
            <box
              key={item.provider}
              flexDirection="row"
              height={1}
              overflow="hidden"
              backgroundColor={isSelected ? colors.selection : undefined}
              onMouseMove={() => setSelectedIndex(i)}
              onMouseDown={() => handleToggleActive(item.provider)}
              justifyContent="space-between"
              paddingX={1}
            >
              <box flexDirection="row" gap={1}>
                <text fg={item.isActive ? colors.primary : "gray"}>
                  {statusIcon}
                </text>
                <text
                  selectable={false}
                  fg={isSelected ? "black" : "white"}
                  attributes={item.isActive ? TextAttributes.BOLD : undefined}
                >
                  {item.name}
                </text>
              </box>

              <box flexDirection="row" gap={1}>
                <text
                  selectable={false}
                  fg={isSelected ? "black" : item.isConfigured ? "gray" : "gray"}
                  attributes={!item.isConfigured ? TextAttributes.DIM : undefined}
                >
                  {item.maskedKey ?? "(not configured)"}
                </text>
                {item.isActive && (
                  <text fg={isSelected ? "black" : colors.primary}>
                    (active)
                  </text>
                )}
              </box>
            </box>
          );
        })}
      </box>

      <box
        border={["top"]}
        paddingTop={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <text attributes={TextAttributes.DIM}>
          [A] Add/Edit   [D] Delete   [Enter] Set Active
        </text>
        <text attributes={TextAttributes.DIM}>
          [Esc] Close
        </text>
      </box>
    </box>
  );
}
