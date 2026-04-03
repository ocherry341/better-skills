import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, lstat, readlink, symlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { ensureClientSymlink } from "../src/core/clients.js";

describe("ensureClientSymlink", () => {
  let baseDir: string;
  let agentsDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "sync-test-"));
    agentsDir = join(baseDir, "agents-skills");
    await mkdir(agentsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("creates symlink when path does not exist", async () => {
    const clientDir = join(baseDir, "claude-skills");
    const result = await ensureClientSymlink("claude", agentsDir, clientDir);
    expect(result).toBe("created");
    const st = await lstat(clientDir);
    expect(st.isSymbolicLink()).toBe(true);
    const target = await readlink(clientDir);
    expect(target).toBe(agentsDir);
  });

  test("no-op when correct symlink already exists", async () => {
    const clientDir = join(baseDir, "claude-skills");
    await symlink(agentsDir, clientDir);
    const result = await ensureClientSymlink("claude", agentsDir, clientDir);
    expect(result).toBe("exists");
  });

  test("skips when path is a real directory", async () => {
    const clientDir = join(baseDir, "claude-skills");
    await mkdir(clientDir, { recursive: true });
    await writeFile(join(clientDir, "something.md"), "content");
    const result = await ensureClientSymlink("claude", agentsDir, clientDir);
    expect(result).toBe("skipped");
  });
});
