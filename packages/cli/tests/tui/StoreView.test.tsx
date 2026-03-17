import { describe, test, expect, mock } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi, flush } from "./helpers.js";

let storeResult = { total: 5, ok: 5, corrupted: [] as any[] };
const mockStoreVerify = mock(() => Promise.resolve(storeResult));

mock.module("../../src/commands/store-cmd.js", () => ({
  storeVerify: mockStoreVerify,
}));

const { StoreView } = await import("../../src/tui/components/StoreView.js");

describe("StoreView", () => {
  test("shows store health summary", async () => {
    storeResult = { total: 5, ok: 5, corrupted: [] };
    const { lastFrame, unmount } = render(<StoreView selectedIndex={0} />);
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Total: 5");
    expect(frame).toContain("OK: 5");
    unmount();
  });

  test("shows healthy message when no corruption", async () => {
    storeResult = { total: 3, ok: 3, corrupted: [] };
    const { lastFrame, unmount } = render(<StoreView selectedIndex={0} />);
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("All store entries healthy");
    unmount();
  });

  test("shows corrupted entries when present", async () => {
    storeResult = {
      total: 3,
      ok: 2,
      corrupted: [{ hash: "deadbeef12345678", skills: ["broken@v1"] }],
    };
    const { lastFrame, unmount } = render(<StoreView selectedIndex={0} />);
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Corrupted: 1");
    expect(frame).toContain("deadbeef");
    expect(frame).toContain("broken@v1");
    unmount();
  });

  test("shows status bar with re-verify shortcut", async () => {
    storeResult = { total: 0, ok: 0, corrupted: [] };
    const { lastFrame, unmount } = render(<StoreView selectedIndex={0} />);
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("v:Re-verify");
    expect(frame).toContain("q:Quit");
    unmount();
  });

  test("v key triggers re-verify", async () => {
    storeResult = { total: 3, ok: 3, corrupted: [] };
    mockStoreVerify.mockClear();
    const { stdin, unmount } = render(<StoreView selectedIndex={0} />);
    await flush();
    mockStoreVerify.mockClear(); // clear the initial load call
    stdin.write("v");
    await flush();
    expect(mockStoreVerify).toHaveBeenCalledTimes(1);
    unmount();
  });
});
