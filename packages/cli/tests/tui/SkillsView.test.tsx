import { describe, test, expect, mock } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi, flush } from "./helpers.js";

let skillsData: any[] = [
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
];

mock.module("../../src/tui/hooks/useSkills.js", () => ({
  useSkills: () => ({
    skills: skillsData,
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

  test("d key triggers onDelete with skill name and scope", async () => {
    skillsData = [{ name: "test-skill", global: true, project: false }];
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
    skillsData = [{ name: "test-skill", global: true, project: false }];
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
    skillsData = [{ name: "test-skill", global: true, project: false }];
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
    skillsData = [{ name: "test-skill", global: true, project: false }];
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
    skillsData = [{ name: "test-skill", global: true, project: false }];
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
