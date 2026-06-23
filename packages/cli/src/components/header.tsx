import { Text } from "@opentui/core";

export function Header() {
  return (
    <box justifyContent="center" alignItems="center">
      <box flexDirection="row" justifyContent="center" gap={0.5} alignItems="center">
        <ascii-font font="tiny" text="master" color="gray" />
        <ascii-font font="tiny" text="code" color="white"/>
      </box>
    </box>
  );
}