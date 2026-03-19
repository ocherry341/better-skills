import { describe, test, expect } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi } from "./helpers.js";
import { List, type ListItem } from "../../src/tui/components/List.js";

describe("List", () => {
  test("pads labels so markers align in columns", () => {
    const items: ListItem[] = [
      { key: "short", label: "short", markers: "G P" },
      { key: "a-longer-name", label: "a-longer-name", markers: "G  " },
      { key: "mid", label: "mid", markers: "  P" },
    ];

    const { lastFrame, unmount } = render(
      <List items={items} selectedIndex={0} focused={true} />
    );

    const frame = stripAnsi(lastFrame()!);
    const lines = frame.split("\n");

    // Find lines containing our labels
    const shortLine = lines.find((l) => l.includes("short"))!;
    const longerLine = lines.find((l) => l.includes("a-longer-name"))!;
    const midLine = lines.find((l) => l.includes("mid") && !l.includes("a-longer"))!;

    // Extract the position of "G" or first space of marker area
    // After padEnd, all labels have same length, so markers should start at same column
    const getMarkerStart = (line: string, label: string) => {
      const labelIdx = line.indexOf(label);
      // After the label (padded to max length), there's "  " then the marker
      // The marker area starts at labelIdx + maxLabelLen + 2
      return labelIdx + "a-longer-name".length + 2;
    };

    const pos1 = getMarkerStart(shortLine, "short");
    const pos2 = getMarkerStart(longerLine, "a-longer-name");
    const pos3 = getMarkerStart(midLine, "mid");

    expect(pos1).toBe(pos2);
    expect(pos2).toBe(pos3);

    // Verify the actual marker content at those positions
    expect(shortLine.substring(pos1, pos1 + 3)).toBe("G P");
    expect(longerLine.substring(pos2, pos2 + 3)).toBe("G  ");
    expect(midLine.substring(pos3, pos3 + 3)).toBe("  P");

    unmount();
  });

  test("renders without markers", () => {
    const items: ListItem[] = [
      { key: "a", label: "alpha" },
      { key: "b", label: "beta" },
    ];

    const { lastFrame, unmount } = render(
      <List items={items} selectedIndex={0} focused={true} />
    );

    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("alpha");
    expect(frame).toContain("beta");
    unmount();
  });

  test("shows selected indicator on correct item", () => {
    const items: ListItem[] = [
      { key: "a", label: "first" },
      { key: "b", label: "second" },
    ];

    const { lastFrame, unmount } = render(
      <List items={items} selectedIndex={1} focused={true} />
    );

    const frame = stripAnsi(lastFrame()!);
    const lines = frame.split("\n");
    const firstLine = lines.find((l) => l.includes("first"))!;
    const secondLine = lines.find((l) => l.includes("second"))!;

    // first should NOT have the selected indicator
    expect(firstLine).not.toContain("\u25B8");
    // second should have the selected indicator
    expect(secondLine).toContain("\u25B8");

    unmount();
  });
});
