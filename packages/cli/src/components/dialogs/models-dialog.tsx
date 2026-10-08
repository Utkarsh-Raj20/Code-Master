import { useCallback, useMemo } from "react";
import { TextAttributes } from "@opentui/core";
import { useDialog } from "../../providers/dialog";
import { DialogSearchList } from "../dialog-search-list";
import {
  findSupportedChatModel,
  PROVIDER_INFO,
  type SupportedChatModelId,
} from "@mastercode/shared";
import { getConfiguredProviders } from "../../lib/key-store";
import { KeysDialogContent } from "./keys-dialog";

type ModelsDialogContentProps = {
  models: SupportedChatModelId[];
  onSelectModel: (modelId: SupportedChatModelId) => void;
};

export const ModelsDialogContent = ({
  models,
  onSelectModel,
}: ModelsDialogContentProps) => {
  const dialog = useDialog();
  const configuredProviders = useMemo(() => new Set(getConfiguredProviders()), []);

  const handleSelect = useCallback(
    (modelId: SupportedChatModelId) => {
      const modelDef = findSupportedChatModel(modelId);
      const isConfigured = modelDef ? configuredProviders.has(modelDef.provider) : false;

      if (!isConfigured && modelDef) {
        // Open Keys dialog if key is not configured yet
        dialog.open({
          title: "Configure API Key",
          children: <KeysDialogContent />,
        });
        return;
      }

      onSelectModel(modelId);
      dialog.close();
    },
    [dialog, onSelectModel, configuredProviders],
  );

  return (
    <DialogSearchList
      items={models}
      onSelect={handleSelect}
      filterFn={(modelId, query) => {
        const q = query.toLowerCase();
        const modelDef = findSupportedChatModel(modelId);
        const providerName = modelDef ? PROVIDER_INFO[modelDef.provider]?.name || "" : "";
        return (
          modelId.toLowerCase().includes(q) ||
          providerName.toLowerCase().includes(q)
        );
      }}
      renderItem={(modelId, isSelected) => {
        const modelDef = findSupportedChatModel(modelId);
        const provider = modelDef?.provider;
        const isConfigured = provider ? configuredProviders.has(provider) : false;
        const providerName = provider ? PROVIDER_INFO[provider]?.name || provider : "";

        return (
          <box
            flexDirection="row"
            justifyContent="space-between"
            width="100%"
            paddingX={1}
          >
            <box flexDirection="row" gap={1}>
              <text selectable={false} fg={isSelected ? "black" : "white"}>
                {modelId}
              </text>
              <text
                selectable={false}
                attributes={TextAttributes.DIM}
                fg={isSelected ? "black" : "gray"}
              >
                ({providerName})
              </text>
            </box>

            <text
              selectable={false}
              attributes={TextAttributes.DIM}
              fg={isSelected ? "black" : isConfigured ? "green" : "yellow"}
            >
              {isConfigured ? "Ready" : "Key required"}
            </text>
          </box>
        );
      }}
      getKey={(modelId) => modelId}
      placeholder="Search models or providers"
      emptyText="No matching models"
    />
  );
};
