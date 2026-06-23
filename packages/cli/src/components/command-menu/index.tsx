import type { RefObject } from "react";
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { getFilteredCommands } from "./filter-commands";
import { COMMANDS } from "./commands";


const MAX_VISIBLE_ITEMS = 8;
const COMMAND_COL_WIDTH = Math.max(...COMMANDS.map((cmd)=> cmd.name.length)) + 4;


type CommandMenuProps = {
  query: string;
  selectIndex: number;
  scrollRef?: RefObject<ScrollBoxRenderable | null>;
  onSelect: (index: number)=>void;
  onExecute: (index: number)=>void;
}

export function CommandMenu({
  query,
  selectIndex,
  scrollRef,
  onSelect,
  onExecute
}: CommandMenuProps){
  const filtered = getFilteredCommands(query);
  const visibleHeight = Math.min(filtered.length, MAX_VISIBLE_ITEMS);

  if (filtered.length == 0){
    return(
      <box paddingX={1}>
        <text attributes={TextAttributes.DIM}>No matching commands</text>
      </box>
    )
  }

  return(
    <scrollbox ref={scrollRef} height = {visibleHeight}>
      {filtered.map((cmd,i) => {
        const isSelected = i === selectIndex;
        return (
          <box
          key = {cmd.value}
          flexDirection="row"
          paddingX={1}
          height={1}
          overflow="hidden"
          backgroundColor={isSelected?"#89b4fa":undefined}
          onMouseMove={() => onSelect(i)}
          onMouseDown={() => onExecute(i)}
          >

            <box width={COMMAND_COL_WIDTH} flexShrink={0}>
              <text selectable={false} fg={isSelected ? "black" : "white"}>
                /{cmd.name}
              </text>
            </box>
            <box>
              <text selectable={false} fg={isSelected ? "black" : "grey"}>
                {cmd.description}
              </text>
            </box>

          </box>
        )

      })}
    </scrollbox>
    
  )
}