import React from "react";
import { withFullScreen } from "fullscreen-ink";
import { App } from "./App.js";

export async function startTui(version: string) {
  if (!process.stdin.isTTY) {
    console.error(
      "Error: TUI requires an interactive terminal with raw mode support.\n" +
      "Run directly: cd packages/cli && bun run src/cli.ts tui"
    );
    process.exit(1);
  }
  const ink = withFullScreen(<App version={version} />, { exitOnCtrlC: true });
  await ink.start();
  await ink.waitUntilExit();
}
