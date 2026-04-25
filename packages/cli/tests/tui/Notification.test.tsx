import { describe, expect, test } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { Notification } from "../../src/tui/components/Notification.js";
import { flush, stripAnsi } from "./helpers.js";

describe("Notification", () => {
  test("renders loading notification without animated spinner updates", async () => {
    const { lastFrame, unmount } = render(
      <Notification notification={{ message: "Working...", type: "loading" }} />
    );

    await flush(20);
    const initialFrame = stripAnsi(lastFrame()!);

    await flush(120);
    const laterFrame = stripAnsi(lastFrame()!);

    expect(initialFrame).toBe(laterFrame);
    expect(laterFrame).toContain("… Working...");

    unmount();
  });
});
