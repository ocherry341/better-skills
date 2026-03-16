import React from "react";
import { render } from "ink";
import { App } from "./App.js";

export function startTui(version: string) {
  if (!process.stdin.isTTY) {
    console.error(
      "Error: TUI requires an interactive terminal with raw mode support.\n" +
      "Run directly: cd packages/cli && bun run src/cli.ts tui"
    );
    process.exit(1);
  }
  render(<App version={version} />, { exitOnCtrlC: true });
}
