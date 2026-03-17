import { describe, test, expect, mock } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi } from "./helpers.js";

let storeResult = { total: 5, ok: 5, corrupted: [] as any[] };
const mockRefresh = mock();

mock.module("../../src/tui/hooks/useStore.js", () => ({
  useStore: () => ({
    result: storeResult,
    loading: false,
    refresh: mockRefresh,
  }),
}));

const { StoreView } = await import("../../src/tui/components/StoreView.js");

describe("StoreView", () => {
  test("shows store health summary", () => {
    storeResult = { total: 5, ok: 5, corrupted: [] };
    const { lastFrame, unmount } = render(<StoreView selectedIndex={0} />);
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Total: 5");
    expect(frame).toContain("OK: 5");
    unmount();
  });

  test("shows healthy message when no corruption", () => {
    storeResult = { total: 3, ok: 3, corrupted: [] };
    const { lastFrame, unmount } = render(<StoreView selectedIndex={0} />);
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("All store entries healthy");
    unmount();
  });

  test("shows corrupted entries when present", () => {
    storeResult = {
      total: 3,
      ok: 2,
      corrupted: [{ hash: "deadbeef12345678", skills: ["broken@v1"] }],
    };
    const { lastFrame, unmount } = render(<StoreView selectedIndex={0} />);
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Corrupted: 1");
    expect(frame).toContain("deadbeef");
    expect(frame).toContain("broken@v1");
    unmount();
  });

  test("shows status bar with re-verify shortcut", () => {
    storeResult = { total: 0, ok: 0, corrupted: [] };
    const { lastFrame, unmount } = render(<StoreView selectedIndex={0} />);
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("v:Re-verify");
    expect(frame).toContain("q:Quit");
    unmount();
  });
});
