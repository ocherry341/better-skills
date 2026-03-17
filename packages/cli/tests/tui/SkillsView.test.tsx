import { describe, test, expect, mock } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi } from "./helpers.js";

mock.module("../../src/tui/hooks/useSkills.js", () => ({
  useSkills: () => ({
    skills: [
      {
        name: "my-skill",
        global: true,
        project: false,
        version: 2,
        hash: "abcdef1234567890",
        source: "owner/repo",
        addedAt: "2025-01-15T00:00:00Z",
      },
      {
        name: "other-skill",
        global: false,
        project: true,
      },
    ],
    loading: false,
    refresh: () => {},
  }),
}));

const { SkillsView } = await import("../../src/tui/components/SkillsView.js");

describe("SkillsView", () => {
  test("renders skill names in list", () => {
    const { lastFrame, unmount } = render(
      <SkillsView focusPane="left" selectedIndex={0} />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("my-skill");
    expect(frame).toContain("other-skill");
    unmount();
  });

  test("shows scope markers", () => {
    const { lastFrame, unmount } = render(
      <SkillsView focusPane="left" selectedIndex={0} />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("G");
    expect(frame).toContain("P");
    unmount();
  });

  test("shows detail fields for selected skill", () => {
    const { lastFrame, unmount } = render(
      <SkillsView focusPane="right" selectedIndex={0} />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Name: my-skill");
    expect(frame).toContain("Source: owner/repo");
    expect(frame).toContain("Version: v2");
    expect(frame).toContain("Hash: abcdef12");
    unmount();
  });

  test("shows filter info when filterQuery is set", () => {
    const { lastFrame, unmount } = render(
      <SkillsView focusPane="left" selectedIndex={0} filterQuery="my" />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("filter: my");
    expect(frame).toContain("1 match");
    unmount();
  });

  test("shows status bar shortcuts", () => {
    const { lastFrame, unmount } = render(
      <SkillsView focusPane="left" selectedIndex={0} />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("a:Add");
    expect(frame).toContain("d:Delete");
    expect(frame).toContain("q:Quit");
    unmount();
  });
});
