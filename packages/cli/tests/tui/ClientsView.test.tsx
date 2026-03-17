import { describe, test, expect, mock } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi } from "./helpers.js";

mock.module("../../src/tui/hooks/useClients.js", () => ({
  useClients: () => ({
    clients: [
      {
        id: "agents",
        path: "/home/test/.agents/skills",
        enabled: true,
        alwaysOn: true,
      },
      {
        id: "claude",
        path: "/home/test/.claude/skills",
        enabled: true,
        alwaysOn: false,
      },
      {
        id: "cursor",
        path: "/home/test/.cursor/skills",
        enabled: false,
        alwaysOn: false,
      },
    ],
    loading: false,
    refresh: () => {},
  }),
}));

const { ClientsView } = await import(
  "../../src/tui/components/ClientsView.js"
);

describe("ClientsView", () => {
  test("renders client IDs", () => {
    const { lastFrame, unmount } = render(
      <ClientsView selectedIndex={0} />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("agents");
    expect(frame).toContain("claude");
    expect(frame).toContain("cursor");
    unmount();
  });

  test("shows always-on marker for agents", () => {
    const { lastFrame, unmount } = render(
      <ClientsView selectedIndex={0} />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("(always on)");
    unmount();
  });

  test("shows enabled marker for enabled clients", () => {
    const { lastFrame, unmount } = render(
      <ClientsView selectedIndex={1} />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("\u2713 enabled");
    unmount();
  });

  test("shows status bar with enable/disable shortcuts", () => {
    const { lastFrame, unmount } = render(
      <ClientsView selectedIndex={0} />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("a:Enable");
    expect(frame).toContain("d:Disable");
    expect(frame).toContain("q:Quit");
    unmount();
  });
});
