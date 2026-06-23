import {useRef, useState, useMemo, type RefObject} from "react";
import {TextBuffer, type ScrollBoxRenderable} from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { Command } from "./types";
import { getFilteredCommands } from "./filter-commands";

type UseCommandMenuReturn = {
  showCommandMenu: boolean;
  commandQuery: string;
  selectedIndex: number;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  handleContentChange: (text:string) => void;
  resolveCommand:(index:number) => Command | undefined;
  setSelectedIndex: (index: number) => void;
};


export function UseCommandMenu(): UseCommandMenuReturn {
  const [textValue,setTextValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const scrollRef = useRef<ScrollBoxRenderable>(null);

  const commandQuery = showCommandMenu && textValue.startsWith("/") ? textValue.slice(1): "";
  const filteredCommands = useMemo(()=>getFilteredCommands(commandQuery),[commandQuery]);

  const handleContentChange = (text: string) => {
    setTextValue(text);
    setSelectedIndex(0);
    const scrollBox = scrollRef.current;
    if(scrollBox){
      scrollBox.scrollTo(0);
    }
    const prefix = text.startsWith("/") ? text.slice(1): null;
    if (prefix != null && !prefix.includes(" ")) {
      setShowCommandMenu(true);
    }else{
      setShowCommandMenu(false);
    }
  };

  const resolveCommand = (index:number): Command | undefined =>{
    const command = filteredCommands[index];
    if(command){
      setShowCommandMenu(false)
    }
    return command;
  }

  useKeyboard((key)=>{
    if(!showCommandMenu) return;

    if(key.name == "escape"){
      key.preventDefault();
      setShowCommandMenu(false);
    }
    else if(key.name == "up"){
      key.preventDefault();
      setSelectedIndex((i:number) =>{
        const newIndex = Math.max(0, i-1)
        const sb = scrollRef.current;
        if(sb && newIndex < sb.scrollTop){
         sb.scrollTo(newIndex) 
        }
        return newIndex;
      });
    }
    else if (key.name == "down"){
      key.preventDefault();
      const maxIndex = filteredCommands.length -1
      setSelectedIndex((i:number)=>{

        if(filteredCommands.length == 0) return 0;

        const newIndex = Math.min(maxIndex, i+1);
        const sb = scrollRef.current;
        if(sb){
          const viewPortHeight = sb.viewport.height;
          const visibleEnd = sb.scrollTop + viewPortHeight -1;
          if(newIndex >= visibleEnd) {
            sb.scrollTo(newIndex - viewPortHeight + 1);
          }
        }
        return newIndex;
      });
    }
  });

  return {
    showCommandMenu,
    commandQuery,
    selectedIndex,
    scrollRef,
    handleContentChange,
    resolveCommand,
    setSelectedIndex
  };
};
