import React from "react";
import { render } from "ink";
import { App } from "./App.js";

export function startTui(version: string) {
  render(<App version={version} />);
}
