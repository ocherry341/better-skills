import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { status, type StatusEntry } from "../src/commands/status.js";

const cli = join(import.meta.dir, "../src/cli.ts");

describe("status", () => {
  let baseDir: string;
  let globalDir: string;
  let projectDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "status-test-"));
    globalDir = join(baseDir, "global-skills");
    projectDir = join(baseDir, "project-skills");
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("returns empty array when no skills installed", async () => {
    const entries = await status({ globalDir, projectDir });
    expect(entries).toEqual([]);
  });

  test("shows skill only in global", async () => {
    await mkdir(join(globalDir, "my-skill"), { recursive: true });
    await writeFile(join(globalDir, "my-skill", "SKILL.md"), "---\nname: my-skill\n---\n");

    const entries = await status({ globalDir, projectDir });
    expect(entries).toEqual([
      { name: "my-skill", global: true, project: false },
    ]);
  });

  test("shows skill only in project", async () => {
    await mkdir(join(projectDir, "local-skill"), { recursive: true });
    await writeFile(join(projectDir, "local-skill", "SKILL.md"), "---\nname: local-skill\n---\n");

    const entries = await status({ globalDir, projectDir });
    expect(entries).toEqual([
      { name: "local-skill", global: false, project: true },
    ]);
  });

  test("shows skill in both global and project", async () => {
    await mkdir(join(globalDir, "shared-skill"), { recursive: true });
    await writeFile(join(globalDir, "shared-skill", "SKILL.md"), "---\nname: shared-skill\n---\n");
    await mkdir(join(projectDir, "shared-skill"), { recursive: true });
    await writeFile(join(projectDir, "shared-skill", "SKILL.md"), "---\nname: shared-skill\n---\n");

    const entries = await status({ globalDir, projectDir });
    expect(entries).toEqual([
      { name: "shared-skill", global: true, project: true },
    ]);
  });

  test("merges and sorts skills from both sources", async () => {
    await mkdir(join(globalDir, "zeta"), { recursive: true });
    await mkdir(join(globalDir, "alpha"), { recursive: true });
    await mkdir(join(projectDir, "beta"), { recursive: true });

    const entries = await status({ globalDir, projectDir });
    expect(entries.map((e) => e.name)).toEqual(["alpha", "beta", "zeta"]);
  });
});

describe("status CLI", () => {
  test("'status --help' shows command description", async () => {
    const result = await $`bun run ${cli} status --help`.text();
    expect(result).toContain("Show all active skills");
  });
});
