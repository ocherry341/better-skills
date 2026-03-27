// packages/cli/tests/tui/useClients.test.tsx
import { describe, test, expect, mock } from "bun:test";

const mockGetEnabledClients = mock(() => Promise.resolve(["claude"]));

mock.module("../../src/core/clients.js", () => ({
  getEnabledClients: mockGetEnabledClients,
  getClientRegistry: () => ({
    claude: { globalDir: "/home/test/.claude/skills", projectSubdir: ".claude/skills" },
    cursor: { globalDir: "/home/test/.cursor/skills", projectSubdir: ".cursor/skills" },
  }),
  VALID_CLIENT_IDS: ["claude", "cursor"],
}));
const { useClients } = await import("../../src/tui/hooks/useClients.js");
const { renderHook, flush } = await import("./helpers.js");

describe("useClients", () => {
  test("starts in loading state", () => {
    const hook = renderHook(() => useClients());
    expect(hook.current.loading).toBe(true);
    expect(hook.current.clients).toEqual([]);
    hook.unmount();
  });

  test("returns client list with agents always first and always-on", async () => {
    const hook = renderHook(() => useClients());
    await flush();
    expect(hook.current.loading).toBe(false);
    expect(hook.current.clients).toHaveLength(3); // agents + claude + cursor
    expect(hook.current.clients[0]).toMatchObject({
      id: "agents",
      enabled: true,
      alwaysOn: true,
    });
    hook.unmount();
  });

  test("marks enabled clients correctly", async () => {
    const hook = renderHook(() => useClients());
    await flush();
    const claude = hook.current.clients.find((c) => c.id === "claude");
    const cursor = hook.current.clients.find((c) => c.id === "cursor");
    expect(claude!.enabled).toBe(true);
    expect(cursor!.enabled).toBe(false);
    hook.unmount();
  });
});
