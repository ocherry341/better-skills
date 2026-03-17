// packages/cli/tests/tui/keyboard.test.tsx
import { describe, test, expect, mock } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { Text } from "ink";
import { flush } from "./helpers.js";
import {
  useKeyboard,
  type KeyboardHandlers,
} from "../../src/tui/hooks/useKeyboard.js";

// --- useKeyboard hook tests ---

function KeyboardHarness({ handlers }: { handlers: KeyboardHandlers }) {
  useKeyboard(handlers);
  return <Text>ready</Text>;
}

describe("useKeyboard", () => {
  test("q triggers onQuit", async () => {
    const onQuit = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onQuit }} />
    );
    stdin.write("q");
    await flush();
    expect(onQuit).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("j triggers onDown", async () => {
    const onDown = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onDown }} />
    );
    stdin.write("j");
    await flush();
    expect(onDown).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("k triggers onUp", async () => {
    const onUp = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onUp }} />
    );
    stdin.write("k");
    await flush();
    expect(onUp).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("h triggers onLeft", async () => {
    const onLeft = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onLeft }} />
    );
    stdin.write("h");
    await flush();
    expect(onLeft).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("l triggers onRight", async () => {
    const onRight = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onRight }} />
    );
    stdin.write("l");
    await flush();
    expect(onRight).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("number keys 1-4 forwarded via onKey", async () => {
    const onKey = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onKey }} />
    );
    stdin.write("1");
    stdin.write("3");
    await flush();
    expect(onKey).toHaveBeenCalledWith("1");
    expect(onKey).toHaveBeenCalledWith("3");
    unmount();
  });

  test("enter triggers onEnter", async () => {
    const onEnter = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onEnter }} />
    );
    stdin.write("\r");
    await flush();
    expect(onEnter).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("escape triggers onEscape", async () => {
    const onEscape = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onEscape }} />
    );
    stdin.write("\x1b");
    await flush();
    expect(onEscape).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("single char keys forwarded via onKey", async () => {
    const onKey = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onKey }} />
    );
    stdin.write("a");
    stdin.write("x");
    await flush();
    expect(onKey).toHaveBeenCalledWith("a");
    expect(onKey).toHaveBeenCalledWith("x");
    unmount();
  });
});

// --- StoreView: v key triggers refresh ---

const mockStoreRefresh = mock();

mock.module("../../src/tui/hooks/useStore.js", () => ({
  useStore: () => ({
    result: { total: 3, ok: 3, corrupted: [] },
    loading: false,
    refresh: mockStoreRefresh,
  }),
}));

const { StoreView } = await import("../../src/tui/components/StoreView.js");

describe("StoreView keyboard", () => {
  test("v key triggers refresh", async () => {
    mockStoreRefresh.mockClear();
    const { stdin, unmount } = render(<StoreView selectedIndex={0} />);
    stdin.write("v");
    await flush();
    expect(mockStoreRefresh).toHaveBeenCalledTimes(1);
    unmount();
  });
});

// --- ClientsView: a/d key callbacks ---

mock.module("../../src/tui/hooks/useClients.js", () => ({
  useClients: () => ({
    clients: [
      { id: "agents", path: "/test", enabled: true, alwaysOn: true },
      { id: "claude", path: "/test", enabled: false, alwaysOn: false },
      { id: "cursor", path: "/test", enabled: true, alwaysOn: false },
    ],
    loading: false,
    refresh: () => {},
  }),
}));

const { ClientsView } = await import(
  "../../src/tui/components/ClientsView.js"
);

describe("ClientsView keyboard", () => {
  test("a key triggers onEnableClient for disabled client", async () => {
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

// --- SkillsView: d/m/a key callbacks ---

mock.module("../../src/tui/hooks/useSkills.js", () => ({
  useSkills: () => ({
    skills: [{ name: "test-skill", global: true, project: false }],
    loading: false,
    refresh: () => {},
  }),
}));

const { SkillsView } = await import("../../src/tui/components/SkillsView.js");

describe("SkillsView keyboard", () => {
  test("d key triggers onDelete with skill name and scope", async () => {
    const onDelete = mock();
    const { stdin, unmount } = render(
      <SkillsView focusPane="left" selectedIndex={0} onDelete={onDelete} />
    );
    stdin.write("d");
    await flush();
    expect(onDelete).toHaveBeenCalledWith("test-skill", true);
    unmount();
  });

  test("m key triggers onMove", async () => {
    const onMove = mock();
    const { stdin, unmount } = render(
      <SkillsView focusPane="left" selectedIndex={0} onMove={onMove} />
    );
    stdin.write("m");
    await flush();
    expect(onMove).toHaveBeenCalledWith("test-skill", true);
    unmount();
  });

  test("a key triggers onAdd", async () => {
    const onAdd = mock();
    const { stdin, unmount } = render(
      <SkillsView focusPane="left" selectedIndex={0} onAdd={onAdd} />
    );
    stdin.write("a");
    await flush();
    expect(onAdd).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("d/m/a keys do nothing in search mode", async () => {
    const onDelete = mock();
    const onMove = mock();
    const onAdd = mock();
    const { stdin, unmount } = render(
      <SkillsView
        focusPane="left"
        selectedIndex={0}
        searchMode={true}
        onDelete={onDelete}
        onMove={onMove}
        onAdd={onAdd}
      />
    );
    stdin.write("d");
    stdin.write("m");
    stdin.write("a");
    await flush();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
    unmount();
  });

  test("d/m/a keys do nothing in action mode", async () => {
    const onDelete = mock();
    const onMove = mock();
    const { stdin, unmount } = render(
      <SkillsView
        focusPane="left"
        selectedIndex={0}
        actionMode={{ type: "confirmDelete", skillName: "x", isGlobal: true }}
        onDelete={onDelete}
        onMove={onMove}
      />
    );
    stdin.write("d");
    stdin.write("m");
    await flush();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    unmount();
  });
});
