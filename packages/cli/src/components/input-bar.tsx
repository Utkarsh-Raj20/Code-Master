import { useRef, useCallback, useEffect, use} from "react"
import { useRenderer } from "@opentui/react";
import type { KeyBinding, TextareaRenderable } from "@opentui/core";
import { StatusBar } from "./status-bar";
import type { Command } from "./command-menu/types";
import { UseCommandMenu } from "./command-menu/use-command-menu";
import { CommandMenu } from "./command-menu";
type Props = {
  OnSubmit: (text: string) => void;
  disabled?: boolean;
}

export const TEXTAREA_KEY_BINDINGS: KeyBinding[] = [
  { name: "return", shift: true, action: "newline" },
  { name: "enter", shift: true, action: "newline" },
  { name: "return", meta: true, action: "newline" }, // Alt + Enter fallback
  { name: "enter", meta: true, action: "newline" },
  { name: "return", action: "submit" },
  { name: "enter", action: "submit" }
];

export function InputBar({OnSubmit, disabled = false}: Props) {

  const textareaRef = useRef<TextareaRenderable>(null);
  const onSubmitRef = useRef<()=>void>(()=>{})
  const renderer = useRenderer();

  const {
    showCommandMenu,
    commandQuery,
    selectedIndex,
    scrollRef,
    handleContentChange,
    resolveCommand,
    setSelectedIndex,
  } = UseCommandMenu();

  
  
  const handleTextareaContentChange = useCallback (()=>{
    const textarea = textareaRef.current;
    if(!textarea)return;
    
    handleContentChange(textarea.plainText)
  },[]);
  
  
  const handleSubmit = useCallback(()=>{
    if(disabled) return;
    const textarea = textareaRef.current;
    
    if(!textarea) return;
    
    const text = textarea.plainText.trim();
    if(text.length ===0)return;
    
    
    OnSubmit(text);
    textarea.setText("");
    
  },[disabled,OnSubmit])
  
  
  const handleCommand = useCallback((
    command: Command | undefined
  )=>{
    const textarea = textareaRef.current;
    if(!textarea || !command) return;
    textarea.setText("");
    
    if(command.action){
      command.action({
        exit: () => renderer.destroy(),
      });
    }else{
      textarea.insertText(command.value + " ");
    }
    
  },[renderer])
  
  const handleCommandExecute = useCallback(
    (index:number)=>{
      const command = resolveCommand(index);
      handleCommand(command);
  },[resolveCommand, handleCommand]);
  
  useEffect(()=>{
    const textarea = textareaRef.current;
    if(!textarea) return;

    textarea.onSubmit = ()=>{
      onSubmitRef.current();
    }
  },[])

  onSubmitRef.current = () =>{
    if(disabled) return;

    if(showCommandMenu){
      const command = resolveCommand(selectedIndex);
      handleCommand(command);
      return;
    }

    handleSubmit();
  };

  
  return (
    <box width="100%" alignItems="center">
      <box
        border={["left"]}
        borderColor={"cyan"}
        >
        <box
        position="relative"
        justifyContent="center"
        paddingX={2}
        paddingY={1}
        width="100%"
        minWidth={50}
        borderColor="#1A1A24"
        gap={1}
        >
          {showCommandMenu && (
            <box
              position="absolute"
              bottom="100%"
              left={0}
              width="100%"
              backgroundColor="#1a1a24"
              zIndex={10}>
                <CommandMenu
                query={commandQuery}
                selectIndex={selectedIndex}
                scrollRef={scrollRef}
                onSelect={setSelectedIndex}
                onExecute={handleCommandExecute}
                />
              </box>
          )}
          <textarea
            ref={textareaRef}
            keyBindings={TEXTAREA_KEY_BINDINGS}
            focused={!disabled} 
            onContentChange={handleTextareaContentChange}
            placeholder={`Ask anything.. {fix a bug in the database}`}
          />
          <StatusBar/>
        </box>
      </box>
    </box>
  );
}