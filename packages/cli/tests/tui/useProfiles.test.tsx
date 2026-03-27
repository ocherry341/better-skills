// packages/cli/tests/tui/useProfiles.test.tsx
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockListProfiles = mock(() => Promise.resolve(["default", "work"]));
const mockGetActiveProfileName = mock(() => Promise.resolve("default"));
const mockReadProfile = mock((path: string) => {
  const name = path.replace(/.*\//, "").replace(".json", "");
  return Promise.resolve({
    name,
    skills:
      name === "default"
        ? [{ skillName: "skill-a", v: 1, source: "owner/repo", addedAt: "2025-01-01T00:00:00Z" }]
        : [],
  });
});

mock.module("../../src/core/profile.js", () => ({
  listProfiles: mockListProfiles,
  getActiveProfileName: mockGetActiveProfileName,
  readProfile: mockReadProfile,
}));
const { useProfiles } = await import("../../src/tui/hooks/useProfiles.js");
const { renderHook, flush } = await import("./helpers.js");

describe("useProfiles", () => {
  beforeEach(() => {
    mockListProfiles.mockClear();
    mockGetActiveProfileName.mockClear();
    mockReadProfile.mockClear();
  });

  test("starts in loading state", () => {
    const hook = renderHook(() => useProfiles());
    expect(hook.current.loading).toBe(true);
    expect(hook.current.profiles).toEqual([]);
    hook.unmount();
  });

  test("loads profiles with active status", async () => {
    const hook = renderHook(() => useProfiles());
    await flush();
    expect(hook.current.loading).toBe(false);
    expect(hook.current.profiles).toHaveLength(2);
    expect(hook.current.profiles[0]).toMatchObject({
      name: "default",
      active: true,
      skillCount: 1,
    });
    expect(hook.current.profiles[1]).toMatchObject({
      name: "work",
      active: false,
      skillCount: 0,
    });
    hook.unmount();
  });

  test("includes skill details in active profile", async () => {
    const hook = renderHook(() => useProfiles());
    await flush();
    expect(hook.current.profiles[0].skills).toEqual([
      { skillName: "skill-a", v: 1, source: "owner/repo", hash: undefined, allVersions: [] },
    ]);
    hook.unmount();
  });
});
