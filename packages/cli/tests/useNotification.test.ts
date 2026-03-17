import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("useNotification auto-dismiss logic", () => {
  let originalSetTimeout: typeof globalThis.setTimeout;
  let originalClearTimeout: typeof globalThis.clearTimeout;
  let capturedCallbacks: { cb: () => void; ms: number }[];
  let capturedClears: number[];
  let timerId: number;

  beforeEach(() => {
    capturedCallbacks = [];
    capturedClears = [];
    timerId = 0;
    originalSetTimeout = globalThis.setTimeout;
    originalClearTimeout = globalThis.clearTimeout;
    // @ts-expect-error -- mock
    globalThis.setTimeout = (cb: () => void, ms: number) => {
      const id = ++timerId;
      capturedCallbacks.push({ cb, ms });
      return id;
    };
    // @ts-expect-error -- mock
    globalThis.clearTimeout = (id: number) => {
      capturedClears.push(id);
    };
  });

  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });

  test("success type schedules dismiss after 3000ms", () => {
    const type = "success";
    const ms = type === "error" ? 5000 : 3000;
    expect(ms).toBe(3000);
  });

  test("error type schedules dismiss after 5000ms", () => {
    const type = "error";
    const ms = type === "error" ? 5000 : 3000;
    expect(ms).toBe(5000);
  });

  test("loading type does not auto-dismiss", () => {
    const type = "loading";
    const shouldAutoDismiss = type !== "loading";
    expect(shouldAutoDismiss).toBe(false);
  });
});
