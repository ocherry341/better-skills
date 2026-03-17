// packages/cli/tests/tui/useStore.test.tsx
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockStoreVerify = mock(() =>
  Promise.resolve({ total: 5, ok: 5, corrupted: [] })
);

mock.module("../../src/commands/store-cmd.js", () => ({
  storeVerify: mockStoreVerify,
}));

const { useStore } = await import("../../src/tui/hooks/useStore.js");
const { renderHook, flush } = await import("./helpers.js");

describe("useStore", () => {
  beforeEach(() => {
    mockStoreVerify.mockClear();
  });

  test("starts in loading state with null result", () => {
    const hook = renderHook(() => useStore());
    expect(hook.current.loading).toBe(true);
    expect(hook.current.result).toBeNull();
    hook.unmount();
  });

  test("returns verify result after load", async () => {
    const hook = renderHook(() => useStore());
    await flush();
    expect(hook.current.loading).toBe(false);
    expect(hook.current.result).toEqual({
      total: 5,
      ok: 5,
      corrupted: [],
    });
    hook.unmount();
  });

  test("handles corrupted entries", async () => {
    mockStoreVerify.mockImplementationOnce(() =>
      Promise.resolve({
        total: 3,
        ok: 2,
        corrupted: [{ hash: "abc12345deadbeef", skills: ["broken@v1"] }],
      })
    );
    const hook = renderHook(() => useStore());
    await flush();
    expect(hook.current.result!.corrupted).toHaveLength(1);
    expect(hook.current.result!.corrupted[0].hash).toBe("abc12345deadbeef");
    hook.unmount();
  });
});
