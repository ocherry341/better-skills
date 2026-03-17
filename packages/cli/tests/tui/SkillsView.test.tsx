import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi, flush } from "./helpers.js";
import type { LsEntry } from "../../src/commands/ls.js";

let lsData: LsEntry[] = [
  { name: "my-skill", global: true, project: false },
  { name: "other-skill", global: false, project: true },
];

const mockLs = mock<() => Promise<LsEntry[]>>(() => Promise.resolve(lsData));
const mockLsAll = mock(() => Promise.resolve([]));

const mockReadRegistry = mock(() => Promise.resolve({ skills: {} }));
const mockGetLatestVersion = mock((_registry: any, name: string) => {
  if (name === "my-skill") {
    return { v: 2, hash: "abcdef1234567890", source: "owner/repo", addedAt: "2025-01-15T00:00:00Z" };
  }
  return null;
});

mock.module("../../src/commands/ls.js", () => ({
  ls: mockLs,
  lsAll: mockLsAll,
}));
mock.module("../../src/core/registry.js", () => ({
  readRegistry: mockReadRegistry,
  getLatestVersion: mockGetLatestVersion,
}));
mock.module("../../src/utils/paths.js", () => ({
  getStorePath: () => "/tmp/bsk-test-store",
  getGlobalSkillsPath: () => "/tmp/bsk-test-global",
  getProjectSkillsPath: () => "/tmp/bsk-test-project",
  getSkillsPath: (global: boolean) => global ? "/tmp/bsk-test-global" : "/tmp/bsk-test-project",
  getProfilesPath: () => "/tmp/bsk-test-profiles",
  getProfilePath: (name: string) => `/tmp/bsk-test-profiles/${name}.json`,
  getActiveProfileFilePath: () => "/tmp/bsk-test-profiles/.active",
  getRegistryPath: () => "/tmp/bsk-test-registry.json",
  getConfigPath: () => "/tmp/bsk-test-config.json",
  getTempPath: () => "/tmp/bsk-test-tmp",
  resolveAbsolute: (p: string) => p,
}));

const { SkillsView } = await import("../../src/tui/components/SkillsView.js");

describe("SkillsView", () => {
  beforeEach(() => {
    lsData = [
      { name: "my-skill", global: true, project: false },
      { name: "other-skill", global: false, project: true },
    ];
    mockLs.mockImplementation(() => Promise.resolve(lsData));
    mockGetLatestVersion.mockImplementation((_registry: any, name: string) => {
      if (name === "my-skill") {
        return { v: 2, hash: "abcdef1234567890", source: "owner/repo", addedAt: "2025-01-15T00:00:00Z" };
      }
      return null;
    });
  });

  test("renders skill names in list", async () => {
    const { lastFrame, unmount } = render(
      <SkillsView focusPane="left" selectedIndex={0} />
    );
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("my-skill");
    expect(frame).toContain("other-skill");
    unmount();
  });

  test("shows scope markers", async () => {
    const { lastFrame, unmount } = render(
      <SkillsView focusPane="left" selectedIndex={0} />
    );
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("G");
    expect(frame).toContain("P");
    unmount();
  });

  test("shows detail fields for selected skill", async () => {
    const { lastFrame, unmount } = render(
      <SkillsView focusPane="right" selectedIndex={0} />
    );
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Name: my-skill");
    expect(frame).toContain("Source: owner/repo");
    expect(frame).toContain("Version: v2");
    expect(frame).toContain("Hash: abcdef12");
    unmount();
  });

  test("shows filter info when filterQuery is set", async () => {
    const { lastFrame, unmount } = render(
      <SkillsView focusPane="left" selectedIndex={0} filterQuery="my" />
    );
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("filter: my");
    expect(frame).toContain("1 match");
    unmount();
  });

  test("shows status bar shortcuts", async () => {
    const { lastFrame, unmount } = render(
      <SkillsView focusPane="left" selectedIndex={0} />
    );
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("a:Add");
    expect(frame).toContain("d:Delete");
    expect(frame).toContain("q:Quit");
    unmount();
  });

  test("d key triggers onDelete with skill name and scope", async () => {
    lsData = [{ name: "test-skill", global: true, project: false }];
    mockLs.mockImplementation(() => Promise.resolve(lsData));
    mockGetLatestVersion.mockImplementation(() => null);
    const onDelete = mock();
    const { stdin, unmount } = render(
      <SkillsView focusPane="left" selectedIndex={0} onDelete={onDelete} />
    );
    await flush();
    stdin.write("d");
    await flush();
    expect(onDelete).toHaveBeenCalledWith("test-skill", true);
    unmount();
  });

  test("m key triggers onMove", async () => {
    lsData = [{ name: "test-skill", global: true, project: false }];
    mockLs.mockImplementation(() => Promise.resolve(lsData));
    mockGetLatestVersion.mockImplementation(() => null);
    const onMove = mock();
    const { stdin, unmount } = render(
      <SkillsView focusPane="left" selectedIndex={0} onMove={onMove} />
    );
    await flush();
    stdin.write("m");
    await flush();
    expect(onMove).toHaveBeenCalledWith("test-skill", true);
    unmount();
  });

  test("a key triggers onAdd", async () => {
    lsData = [{ name: "test-skill", global: true, project: false }];
    mockLs.mockImplementation(() => Promise.resolve(lsData));
    mockGetLatestVersion.mockImplementation(() => null);
    const onAdd = mock();
    const { stdin, unmount } = render(
      <SkillsView focusPane="left" selectedIndex={0} onAdd={onAdd} />
    );
    await flush();
    stdin.write("a");
    await flush();
    expect(onAdd).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("d/m/a keys do nothing in search mode", async () => {
    lsData = [{ name: "test-skill", global: true, project: false }];
    mockLs.mockImplementation(() => Promise.resolve(lsData));
    mockGetLatestVersion.mockImplementation(() => null);
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
    await flush();
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
    lsData = [{ name: "test-skill", global: true, project: false }];
    mockLs.mockImplementation(() => Promise.resolve(lsData));
    mockGetLatestVersion.mockImplementation(() => null);
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
    await flush();
    stdin.write("d");
    stdin.write("m");
    await flush();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    unmount();
  });
});
