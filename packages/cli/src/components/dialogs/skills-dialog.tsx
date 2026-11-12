import { useCallback, useMemo, useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useDialog } from "../../providers/dialog";
import { useToast } from "../../providers/toast";
import { useTheme } from "../../providers/theme";
import { DialogSearchList } from "../dialog-search-list";
import { SkillManager, type Skill } from "../../lib/skill-manager";

export function SkillsDialogContent() {
  const dialog = useDialog();
  const { show } = useToast();
  const { colors } = useTheme();

  const skills = useMemo(() => SkillManager.loadSkills(), []);
  const [highlightedSkill, setHighlightedSkill] = useState<Skill | null>(() => skills[0] ?? null);

  const handleSelect = useCallback(
    (skill: Skill) => {
      dialog.close();
      show({
        message: `Skill "${skill.name}" selected. Ask naturally (e.g. "Use ${skill.name} to...") and Mastercode will activate it automatically!`,
        variant: "info",
      });
    },
    [dialog, show],
  );

  const isProjectSkill = (skill: Skill) => {
    return skill.filePath.includes(".mastercode");
  };

  return (
    <box flexDirection="column" gap={1} width="100%">
      <DialogSearchList
        items={skills}
        onSelect={handleSelect}
        onHighlight={setHighlightedSkill}
        filterFn={(skill, query) => {
          const q = query.toLowerCase();
          return (
            skill.name.toLowerCase().includes(q) ||
            skill.description.toLowerCase().includes(q) ||
            skill.triggers.some((t) => t.toLowerCase().includes(q))
          );
        }}
        renderItem={(skill, isSelected) => {
          const isProject = isProjectSkill(skill);
          return (
            <box
              flexDirection="row"
              justifyContent="space-between"
              width="100%"
              paddingX={1}
            >
              <text selectable={false} fg={isSelected ? "black" : colors.primary}>
                {isSelected ? "▶ " : "  "}{skill.name}
              </text>
              <text
                selectable={false}
                attributes={TextAttributes.DIM}
                fg={isSelected ? "black" : isProject ? "cyan" : "gray"}
              >
                {isProject ? "[Project]" : "[Built-in]"}
              </text>
            </box>
          );
        }}
        getKey={(skill) => skill.name}
        placeholder="Search skills by name, trigger, or description"
        emptyText="No matching skills found"
        maxVisibleItems={12}
      />

      {highlightedSkill && (
        <box
          flexDirection="column"
          paddingTop={1}
          border={["top"]}
          borderColor={colors.dimSeparator}
          gap={1}
          width="100%"
        >
          <box flexDirection="row" gap={1} alignItems="center">
            <text fg={colors.primary} attributes={TextAttributes.BOLD}>
              {highlightedSkill.name}
            </text>
            <text fg={isProjectSkill(highlightedSkill) ? "cyan" : "gray"} attributes={TextAttributes.DIM}>
              {isProjectSkill(highlightedSkill) ? "(Workspace)" : "(Built-in)"}
            </text>
          </box>

          <text attributes={TextAttributes.DIM}>
            {highlightedSkill.description || "No description provided."}
          </text>

          {highlightedSkill.triggers.length > 0 && (
            <text attributes={TextAttributes.DIM}>
              <em fg={colors.info}>Triggers: </em>
              <em fg="yellow">{highlightedSkill.triggers.join(", ")}</em>
            </text>
          )}

          <text fg="gray" attributes={TextAttributes.DIM}>
            [Enter] to select • Auto-activates on matching prompts
          </text>
        </box>
      )}
    </box>
  );
}

