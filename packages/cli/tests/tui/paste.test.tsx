// packages/cli/tests/tui/paste.test.tsx
// Verifies that multi-character input (terminal paste / bracketed paste) is
// correctly appended to all text input fields in the TUI.
import { describe, test, expect, mock } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi, flush } from "./helpers.js";

// --- mocks (same pattern as SkillsView.test.tsx) ---
mock.module("../../src/commands/ls.js", () => ({
  ls: mock(() => Promise.resolve([{ name: "skill-a", global: true, project: false }])),
  lsAll: mock(() => Promise.resolve([])),
}));
mock.module("../../src/core/registry.js", () => ({
  readRegistry: mock(() => Promise.resolve({ skills: {} })),
  getLatestVersion: mock(() => null),
}));
mock.module("../../src/commands/profile.js", () => ({
  profileList: mock(() => Promise.resolve([])),
  profileShow: mock(() => Promise.resolve({ skills: [] })),
  getActiveProfileName: mock(() => Promise.resolve(null)),
}));
mock.module("../../src/core/store.js", () => ({
  verifyStore: mock(() => Promise.resolve({ total: 0, valid: 0, corrupt: [] })),
  verifyStoreEntry: mock(() => Promise.resolve(true)),
  getHashPath: mock((hash: string) => `/tmp/bsk-test-store/${hash}`),
  has: mock(() => Promise.resolve(false)),
  store: mock(() => Promise.resolve("")),
  list: mock(() => Promise.resolve([])),
  remove: mock(() => Promise.resolve()),
  verifiedLinkSkill: mock(() => Promise.resolve()),
}));
mock.module("../../src/core/clients.js", () => ({
  listClients: mock(() => Promise.resolve([])),
  getEnabledClients: mock(() => Promise.resolve([])),
  readConfig: mock(() => Promise.resolve({ clients: [] })),
  writeConfig: mock(() => Promise.resolve()),
  getClientSkillsDir: mock(() => "/tmp/bsk-test-client"),
  getClientProjectSubdir: mock(() => null),
  getClientRegistry: () => ({}),
  VALID_CLIENT_IDS: [],
}));

const { App } = await import("../../src/tui/App.js");

describe("paste (multi-character input)", () => {
  test("search field accepts pasted multi-character input", async () => {
    const { stdin, lastFrame, unmount } = render(<App version="0.0.0" />);
    await flush(50);

    // Enter search mode
    stdin.write("/");
    await flush(50);

    // Simulate paste: multi-character string in a single write
    stdin.write("my-skill");
    await flush(50);

    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("my-skill");
    unmount();
  });

  test("add-source field accepts pasted multi-character input", async () => {
    const { stdin, lastFrame, unmount } = render(<App version="0.0.0" />);
    await flush(50);

    // Enter add-input mode
    stdin.write("a");
    await flush(50);

    // Simulate paste: multi-character string in a single write
    stdin.write("github.com/owner/repo");
    await flush(50);

    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("github.com/owner/repo");
    unmount();
  });
});
