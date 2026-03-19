import { describe, test, expect, mock } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi, flush } from "./helpers.js";

let storeResult = { total: 5, ok: 5, corrupted: [] as any[] };
const mockStoreVerify = mock(() => Promise.resolve(storeResult));

let storeLsResult = { entries: [] as any[] };
const mockStoreLs = mock(() => Promise.resolve(storeLsResult));

mock.module("../../src/commands/store-cmd.js", () => ({
  storeVerify: mockStoreVerify,
  storeLs: mockStoreLs,
}));

const { StoreView } = await import("../../src/tui/components/StoreView.js");

describe("StoreView", () => {
  test("shows store health summary", async () => {
    storeResult = { total: 5, ok: 5, corrupted: [] };
    storeLsResult = { entries: [] };
    const { lastFrame, unmount } = render(<StoreView selectedIndex={0} focusPane="left" />);
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Health: 5 entries, 5 ok");
    unmount();
  });

  test("shows healthy message when no corruption", async () => {
    storeResult = { total: 3, ok: 3, corrupted: [] };
    storeLsResult = { entries: [] };
    const { lastFrame, unmount } = render(<StoreView selectedIndex={0} focusPane="left" />);
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Health: 3 entries, 3 ok");
    expect(frame).not.toContain("corrupted");
    unmount();
  });

  test("shows corrupted entries when present", async () => {
    storeResult = {
      total: 3,
      ok: 2,
      corrupted: [{ hash: "deadbeef12345678", skills: ["broken@v1"] }],
    };
    storeLsResult = { entries: [] };
    const { lastFrame, unmount } = render(<StoreView selectedIndex={0} focusPane="left" />);
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("1 corrupted");
    unmount();
  });

  test("shows status bar with re-verify shortcut", async () => {
    storeResult = { total: 0, ok: 0, corrupted: [] };
    storeLsResult = { entries: [] };
    const { lastFrame, unmount } = render(<StoreView selectedIndex={0} focusPane="left" />);
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("v:Re-verify");
    expect(frame).toContain("r:Refresh");
    expect(frame).toContain("q:Quit");
    unmount();
  });

  test("v key triggers re-verify", async () => {
    storeResult = { total: 3, ok: 3, corrupted: [] };
    storeLsResult = { entries: [] };
    mockStoreVerify.mockClear();
    const { stdin, unmount } = render(<StoreView selectedIndex={0} focusPane="left" />);
    await flush();
    mockStoreVerify.mockClear(); // clear the initial load call
    stdin.write("v");
    await flush();
    expect(mockStoreVerify).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("shows store entries in list", async () => {
    storeResult = { total: 1, ok: 1, corrupted: [] };
    storeLsResult = {
      entries: [
        { hash: "abc123def456", skills: [{ name: "my-skill", v: 1, source: "owner/repo" }], size: 2048 },
      ],
    };
    const { lastFrame, unmount } = render(<StoreView selectedIndex={0} focusPane="left" />);
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("abc123def456");
    expect(frame).toContain("my-skill");
    unmount();
  });

  test("r key triggers refresh of store list", async () => {
    storeResult = { total: 0, ok: 0, corrupted: [] };
    storeLsResult = { entries: [] };
    mockStoreLs.mockClear();
    const { stdin, unmount } = render(<StoreView selectedIndex={0} focusPane="left" />);
    await flush();
    mockStoreLs.mockClear(); // clear initial load
    stdin.write("r");
    await flush();
    expect(mockStoreLs).toHaveBeenCalledTimes(1);
    unmount();
  });
});
