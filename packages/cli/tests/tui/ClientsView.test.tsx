import { describe, test, expect, mock } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi, flush } from "./helpers.js";

let clientsData = [
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
];

mock.module("../../src/tui/hooks/useClients.js", () => ({
  useClients: () => ({
    clients: clientsData,
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

  test("a key triggers onEnableClient for disabled client", async () => {
    clientsData = [
      { id: "agents", path: "/test", enabled: true, alwaysOn: true },
      { id: "claude", path: "/test", enabled: false, alwaysOn: false },
      { id: "cursor", path: "/test", enabled: true, alwaysOn: false },
    ];
    const onEnable = mock();
    const { stdin, unmount } = render(
      <ClientsView selectedIndex={1} onEnableClient={onEnable} />
    );
    stdin.write("a");
    await flush();
    expect(onEnable).toHaveBeenCalledWith("claude");
    unmount();
  });

  test("d key triggers onDisableClient for enabled client", async () => {
    clientsData = [
      { id: "agents", path: "/test", enabled: true, alwaysOn: true },
      { id: "claude", path: "/test", enabled: false, alwaysOn: false },
      { id: "cursor", path: "/test", enabled: true, alwaysOn: false },
    ];
    const onDisable = mock();
    const { stdin, unmount } = render(
      <ClientsView selectedIndex={2} onDisableClient={onDisable} />
    );
    stdin.write("d");
    await flush();
    expect(onDisable).toHaveBeenCalledWith("cursor");
    unmount();
  });

  test("a key does nothing for always-on client", async () => {
    const onEnable = mock();
    const { stdin, unmount } = render(
      <ClientsView selectedIndex={0} onEnableClient={onEnable} />
    );
    stdin.write("a");
    await flush();
    expect(onEnable).not.toHaveBeenCalled();
    unmount();
  });

  test("d key does nothing for already-disabled client", async () => {
    clientsData = [
      { id: "agents", path: "/test", enabled: true, alwaysOn: true },
      { id: "claude", path: "/test", enabled: false, alwaysOn: false },
      { id: "cursor", path: "/test", enabled: true, alwaysOn: false },
    ];
    const onDisable = mock();
    const { stdin, unmount } = render(
      <ClientsView selectedIndex={1} onDisableClient={onDisable} />
    );
    stdin.write("d");
    await flush();
    expect(onDisable).not.toHaveBeenCalled();
    unmount();
  });
});
