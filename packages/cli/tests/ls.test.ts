import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { ls, lsAll, type LsEntry, type LsAllEntry } from "../src/commands/ls.js";

const cli = join(import.meta.dir, "../src/cli.ts");

describe("ls", () => {
  let baseDir: string;
  let globalDir: string;
  let projectDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "ls-test-"));
    globalDir = join(baseDir, "global-skills");
    projectDir = join(baseDir, "project-skills");
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("returns empty array when no skills installed", async () => {
    const entries = await ls({ globalDir, projectDir });
    expect(entries).toEqual([]);
  });

  test("shows skill only in global", async () => {
    await mkdir(join(globalDir, "my-skill"), { recursive: true });
    await writeFile(join(globalDir, "my-skill", "SKILL.md"), "---\nname: my-skill\n---\n");

    const entries = await ls({ globalDir, projectDir });
    expect(entries).toEqual([
      { name: "my-skill", global: true, project: false },
    ]);
  });

  test("shows skill only in project", async () => {
    await mkdir(join(projectDir, "local-skill"), { recursive: true });
    await writeFile(join(projectDir, "local-skill", "SKILL.md"), "---\nname: local-skill\n---\n");

    const entries = await ls({ globalDir, projectDir });
    expect(entries).toEqual([
      { name: "local-skill", global: false, project: true },
    ]);
  });

  test("shows skill in both global and project", async () => {
    await mkdir(join(globalDir, "shared-skill"), { recursive: true });
    await writeFile(join(globalDir, "shared-skill", "SKILL.md"), "---\nname: shared-skill\n---\n");
    await mkdir(join(projectDir, "shared-skill"), { recursive: true });
    await writeFile(join(projectDir, "shared-skill", "SKILL.md"), "---\nname: shared-skill\n---\n");

    const entries = await ls({ globalDir, projectDir });
    expect(entries).toEqual([
      { name: "shared-skill", global: true, project: true },
    ]);
  });

  test("merges and sorts skills from both sources", async () => {
    await mkdir(join(globalDir, "zeta"), { recursive: true });
    await mkdir(join(globalDir, "alpha"), { recursive: true });
    await mkdir(join(projectDir, "beta"), { recursive: true });

    const entries = await ls({ globalDir, projectDir });
    expect(entries.map((e) => e.name)).toEqual(["alpha", "beta", "zeta"]);
  });
});

describe("lsAll", () => {
  let baseDir: string;
  let registryPath: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "ls-all-test-"));
    registryPath = join(baseDir, "registry.json");
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("returns empty array when registry does not exist", async () => {
    const entries = await lsAll({ registryPath });
    expect(entries).toEqual([]);
  });

  test("returns empty array when registry has no skills", async () => {
    await writeFile(registryPath, JSON.stringify({ skills: {} }));
    const entries = await lsAll({ registryPath });
    expect(entries).toEqual([]);
  });

  test("returns all registered skills sorted by name", async () => {
    await writeFile(
      registryPath,
      JSON.stringify({
        skills: {
          "zeta-skill": { versions: [{ v: 1, hash: "aaa111", source: "owner/zeta", addedAt: "2026-03-01T00:00:00.000Z" }] },
          "alpha-skill": { versions: [{ v: 1, hash: "bbb222", source: "owner/alpha", addedAt: "2026-03-01T00:00:00.000Z" }] },
        },
      })
    );
    const entries = await lsAll({ registryPath });
    expect(entries).toEqual([
      { name: "alpha-skill", hash: "bbb222", source: "owner/alpha", v: 1 },
      { name: "zeta-skill", hash: "aaa111", source: "owner/zeta", v: 1 },
    ]);
  });

  test("returns single registered skill", async () => {
    await writeFile(
      registryPath,
      JSON.stringify({
        skills: {
          "my-skill": { versions: [{ v: 1, hash: "abc123def456", source: "https://github.com/foo/bar", addedAt: "2026-03-01T00:00:00.000Z" }] },
        },
      })
    );
    const entries = await lsAll({ registryPath });
    expect(entries).toEqual([
      { name: "my-skill", hash: "abc123def456", source: "https://github.com/foo/bar", v: 1 },
    ]);
  });
});

describe("list CLI", () => {
  test("'list --help' shows command description", async () => {
    const result = await $`bun run ${cli} list --help`.text();
    expect(result).toContain("Show all active skills");
  });

  test("'ls --help' works as alias", async () => {
    const result = await $`bun run ${cli} ls --help`.text();
    expect(result).toContain("Show all active skills");
  });
});
