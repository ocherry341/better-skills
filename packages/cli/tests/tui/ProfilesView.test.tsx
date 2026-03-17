import { describe, test, expect, mock } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi } from "./helpers.js";

mock.module("../../src/tui/hooks/useProfiles.js", () => ({
  useProfiles: () => ({
    profiles: [
      {
        name: "default",
        active: true,
        skillCount: 2,
        skills: [
          { skillName: "skill-a", v: 1, source: "owner/repo-a" },
          { skillName: "skill-b", v: 3, source: "owner/repo-b" },
        ],
      },
      {
        name: "work",
        active: false,
        skillCount: 0,
        skills: [],
      },
    ],
    loading: false,
    refresh: () => {},
  }),
}));

const { ProfilesView } = await import(
  "../../src/tui/components/ProfilesView.js"
);

describe("ProfilesView", () => {
  test("renders profile names", () => {
    const { lastFrame, unmount } = render(
      <ProfilesView focusPane="left" selectedIndex={0} />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("default");
    expect(frame).toContain("work");
    unmount();
  });

  test("shows active marker for active profile", () => {
    const { lastFrame, unmount } = render(
      <ProfilesView focusPane="left" selectedIndex={0} />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("* active");
    unmount();
  });

  test("shows skill count for inactive profile", () => {
    const { lastFrame, unmount } = render(
      <ProfilesView focusPane="left" selectedIndex={0} />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("0 skills");
    unmount();
  });

  test("shows detail pane fields for selected profile", () => {
    const { lastFrame, unmount } = render(
      <ProfilesView focusPane="right" selectedIndex={0} />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Name: default");
    expect(frame).toContain("Status: Active");
    expect(frame).toContain("Skills: 2");
    unmount();
  });

  test("shows status bar shortcuts", () => {
    const { lastFrame, unmount } = render(
      <ProfilesView focusPane="left" selectedIndex={0} />
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Enter:Switch");
    expect(frame).toContain("q:Quit");
    unmount();
  });
});
