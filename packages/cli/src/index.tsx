import { createCliRenderer, TextAttributes } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { Header } from "./components/header";
import { InputBar } from "./components/input-bar";

function App() {
  return (
    <box 
    justifyContent="center"
    alignItems="center"
    width="100%"
    height="100%"
    gap={2}
    >
      <Header/>
      <box width="100%" maxWidth={78} paddingX={2}>
        <InputBar OnSubmit={()=>{}}/>
      </box>
    </box>
  );
}

const renderer = await createCliRenderer({
  targetFps:60,
  exitOnCtrlC:false,
});
createRoot(renderer).render(<App />);
