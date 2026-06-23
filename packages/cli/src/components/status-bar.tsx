import { TextAttributes } from "@opentui/core";

export function StatusBar() {
  return (
    <box flexDirection="row" alignItems="center" gap={1}>
      <text fg="cyan">build</text>
      <text attributes={TextAttributes.DIM} fg="grey">{'>'}</text>
      <text>opus 4.6</text>
    </box>
  );
}