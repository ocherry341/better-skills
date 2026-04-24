import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi, flush } from "./helpers.js";

const addMock = mock(() => Promise.resolve());
const listAddableSkillsMock = mock(() => Promise.resolve(["skill-one", "skill-two"]));

mock.module("../../src/commands/add.js", () => ({
  add: addMock,
  addSkillToProfile: mock(() => Promise.resolve()),
  listAddableSkills: listAddableSkillsMock,
}));
mock.module("../../src/commands/ls.js", () => ({
  ls: mock(() => Promise.resolve([])),
  lsAll: mock(() => Promise.resolve([])),
}));
mock.module("../../src/core/registry.js", () => ({
  readRegistry: mock(() => Promise.resolve({ skills: {} })),
  getLatestVersion: mock(() => null),
  registerSkill: mock(() => Promise.resolve(1)),
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
  readStoreMeta: mock(() => Promise.resolve(null)),
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("TUI add skill selection", () => {
  beforeEach(() => {
    addMock.mockClear();
    listAddableSkillsMock.mockClear();
    listAddableSkillsMock.mockImplementation(() => Promise.resolve(["skill-one", "skill-two"]));
  });

  test("all path calls add without skill selection", async () => {
    const { stdin, lastFrame, unmount } = render(<App version="0.0.0" />);
    await flush(50);

    stdin.write("a");
    await flush(20);
    stdin.write("owner/repo");
    await flush(20);
    stdin.write("\r");
    await flush(20);

    expect(stripAnsi(lastFrame()!)).toContain("(a)ll or (s)elect skills");

    stdin.write("a");
    await flush(20);
    stdin.write("g");
    await flush(80);

    expect(addMock).toHaveBeenCalledWith("owner/repo", expect.objectContaining({
      global: true,
      skill: undefined,
    }));
    expect(listAddableSkillsMock).not.toHaveBeenCalled();
    unmount();
  });

  test("select path discovers and renders skill popup", async () => {
    const { stdin, lastFrame, unmount } = render(<App version="0.0.0" />);
    await flush(50);

    stdin.write("a");
    await flush(20);
    stdin.write("owner/repo");
    await flush(20);
    stdin.write("\r");
    await flush(20);
    stdin.write("s");
    await flush(100);

    const frame = stripAnsi(lastFrame()!);
    expect(listAddableSkillsMock).toHaveBeenCalledWith("owner/repo");
    expect(frame).toContain("Select skills from owner/repo");
    expect(frame).toContain("[ ] skill-one");
    expect(frame).toContain("[ ] skill-two");
    unmount();
  });

  test("select path installs one selected skill to project", async () => {
    const { stdin, unmount } = render(<App version="0.0.0" />);
    await flush(50);

    stdin.write("a");
    await flush(20);
    stdin.write("owner/repo");
    await flush(20);
    stdin.write("\r");
    await flush(20);
    stdin.write("s");
    await flush(100);
    stdin.write(" ");
    await flush(20);
    stdin.write("\r");
    await flush(20);
    stdin.write("p");
    await flush(100);

    expect(addMock).toHaveBeenCalledWith("owner/repo", expect.objectContaining({
      global: false,
      skill: ["skill-one"],
    }));
    unmount();
  });

  test("select path installs multiple selected skills to project", async () => {
    const { stdin, unmount } = render(<App version="0.0.0" />);
    await flush(50);

    stdin.write("a");
    await flush(20);
    stdin.write("owner/repo");
    await flush(20);
    stdin.write("\r");
    await flush(20);
    stdin.write("s");
    await flush(100);
    stdin.write(" ");
    await flush(20);
    stdin.write("j");
    await flush(20);
    stdin.write(" ");
    await flush(20);
    stdin.write("\r");
    await flush(20);
    stdin.write("p");
    await flush(100);

    expect(addMock).toHaveBeenCalledWith("owner/repo", expect.objectContaining({
      global: false,
      skill: ["skill-one", "skill-two"],
    }));
    unmount();
  });

  test("select path requires at least one selected skill", async () => {
    const { stdin, lastFrame, unmount } = render(<App version="0.0.0" />);
    await flush(50);

    stdin.write("a");
    await flush(20);
    stdin.write("owner/repo");
    await flush(20);
    stdin.write("\r");
    await flush(20);
    stdin.write("s");
    await flush(100);
    stdin.write("\r");
    await flush(20);

    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Select at least one skill.");
    expect(addMock).not.toHaveBeenCalled();
    unmount();
  });

  test("select none shortcut clears selected skills", async () => {
    const { stdin, lastFrame, unmount } = render(<App version="0.0.0" />);
    await flush(50);

    stdin.write("a");
    await flush(20);
    stdin.write("owner/repo");
    await flush(20);
    stdin.write("\r");
    await flush(20);
    stdin.write("s");
    await flush(100);
    stdin.write("a");
    await flush(20);
    stdin.write("n");
    await flush(20);

    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("0 selected");
    expect(frame).toContain("[ ] skill-one");
    expect(frame).toContain("[ ] skill-two");
    unmount();
  });

  test("select all shortcut installs all discovered skills", async () => {
    const { stdin, unmount } = render(<App version="0.0.0" />);
    await flush(50);

    stdin.write("a");
    await flush(20);
    stdin.write("owner/repo");
    await flush(20);
    stdin.write("\r");
    await flush(20);
    stdin.write("s");
    await flush(100);
    stdin.write("a");
    await flush(20);
    stdin.write("\r");
    await flush(20);
    stdin.write("g");
    await flush(100);

    expect(addMock).toHaveBeenCalledWith("owner/repo", expect.objectContaining({
      global: true,
      skill: ["skill-one", "skill-two"],
    }));
    unmount();
  });

  test("escape from select popup returns to install mode", async () => {
    const { stdin, lastFrame, unmount } = render(<App version="0.0.0" />);
    await flush(50);

    stdin.write("a");
    await flush(20);
    stdin.write("owner/repo");
    await flush(20);
    stdin.write("\r");
    await flush(20);
    stdin.write("s");
    await flush(100);
    stdin.write("\x1b");
    await flush(50);

    expect(stripAnsi(lastFrame()!)).toContain("(a)ll or (s)elect skills");
    unmount();
  });

  test("escape from install mode cancels add flow", async () => {
    const { stdin, lastFrame, unmount } = render(<App version="0.0.0" />);
    await flush(50);

    stdin.write("a");
    await flush(20);
    stdin.write("owner/repo");
    await flush(20);
    stdin.write("\r");
    await flush(20);
    stdin.write("\x1b");
    await flush(50);

    const frame = stripAnsi(lastFrame()!);
    expect(frame).not.toContain("(a)ll or (s)elect skills");
    expect(addMock).not.toHaveBeenCalled();
    expect(listAddableSkillsMock).not.toHaveBeenCalled();
    unmount();
  });

  test("pending discovery result is ignored after cancel", async () => {
    const deferred = createDeferred<string[]>();
    listAddableSkillsMock.mockImplementationOnce(() => deferred.promise);

    const { stdin, lastFrame, unmount } = render(<App version="0.0.0" />);
    await flush(50);

    stdin.write("a");
    await flush(20);
    stdin.write("owner/repo");
    await flush(20);
    stdin.write("\r");
    await flush(20);
    stdin.write("s");
    await flush(20);
    stdin.write("\x1b");
    await flush(20);

    deferred.resolve(["skill-one"]);
    await flush(100);

    const frame = stripAnsi(lastFrame()!);
    expect(frame).not.toContain("Select skills from owner/repo");
    expect(frame).not.toContain("Discovering skills...");
    expect(addMock).not.toHaveBeenCalled();
    unmount();
  });

  test("pending discovery error is ignored after cancel", async () => {
    const deferred = createDeferred<string[]>();
    listAddableSkillsMock.mockImplementationOnce(() => deferred.promise);

    const { stdin, lastFrame, unmount } = render(<App version="0.0.0" />);
    await flush(50);

    stdin.write("a");
    await flush(20);
    stdin.write("owner/repo");
    await flush(20);
    stdin.write("\r");
    await flush(20);
    stdin.write("s");
    await flush(20);
    stdin.write("\x1b");
    await flush(20);

    deferred.reject(new Error("network failed"));
    await flush(100);

    const frame = stripAnsi(lastFrame()!);
    expect(frame).not.toContain("network failed");
    expect(frame).not.toContain("Discovering skills...");
    expect(frame).not.toContain("Select skills from owner/repo");
    expect(addMock).not.toHaveBeenCalled();
    unmount();
  });

  test("select path shows empty state when no skills are discovered", async () => {
    listAddableSkillsMock.mockResolvedValueOnce([]);
    const { stdin, lastFrame, unmount } = render(<App version="0.0.0" />);
    await flush(50);

    stdin.write("a");
    await flush(20);
    stdin.write("owner/empty");
    await flush(20);
    stdin.write("\r");
    await flush(20);
    stdin.write("s");
    await flush(100);

    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("No skills found in this source.");
    expect(addMock).not.toHaveBeenCalled();
    unmount();
  });
});
