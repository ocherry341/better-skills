// packages/cli/tests/tui/useSkills.test.tsx
import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { LsEntry } from "../../src/commands/ls.js";

const mockLs = mock<() => Promise<LsEntry[]>>(() =>
  Promise.resolve([
    { name: "skill-a", global: true, project: false },
    { name: "skill-b", global: false, project: true },
  ])
);

const mockLsAll = mock(() => Promise.resolve([]));

const mockReadRegistry = mock(() => Promise.resolve({ skills: {} }));
const mockGetLatestVersion = mock(() => null);

mock.module("../../src/commands/ls.js", () => ({
  ls: mockLs,
  lsAll: mockLsAll,
}));
mock.module("../../src/core/registry.js", () => ({
  readRegistry: mockReadRegistry,
  getLatestVersion: mockGetLatestVersion,
}));
mock.module("../../src/utils/paths.js", () => ({
  getGlobalSkillsPath: () => "/tmp/bsk-test-global",
  getProjectSkillsPath: () => "/tmp/bsk-test-project",
}));

const { useSkills } = await import("../../src/tui/hooks/useSkills.js");
const { renderHook, flush } = await import("./helpers.js");

describe("useSkills", () => {
  beforeEach(() => {
    mockLs.mockClear();
    mockLsAll.mockClear();
    mockReadRegistry.mockClear();
    mockGetLatestVersion.mockClear();
  });

  test("starts in loading state with empty skills", () => {
    const hook = renderHook(() => useSkills());
    expect(hook.current.loading).toBe(true);
    expect(hook.current.skills).toEqual([]);
    hook.unmount();
  });

  test("loads skills from ls and registry", async () => {
    const hook = renderHook(() => useSkills());
    await flush();
    expect(hook.current.loading).toBe(false);
    expect(hook.current.skills).toHaveLength(2);
    expect(hook.current.skills[0]).toMatchObject({
      name: "skill-a",
      global: true,
      project: false,
    });
    expect(hook.current.skills[1]).toMatchObject({
      name: "skill-b",
      global: false,
      project: true,
    });
    hook.unmount();
  });

  test("returns empty skills on error", async () => {
    mockLs.mockImplementationOnce(() => Promise.reject(new Error("fail")));
    const hook = renderHook(() => useSkills());
    await flush();
    expect(hook.current.loading).toBe(false);
    expect(hook.current.skills).toEqual([]);
    hook.unmount();
  });

  test("calls ls and readRegistry on mount", async () => {
    const hook = renderHook(() => useSkills());
    await flush();
    expect(mockLs).toHaveBeenCalled();
    expect(mockReadRegistry).toHaveBeenCalled();
    hook.unmount();
  });
});
