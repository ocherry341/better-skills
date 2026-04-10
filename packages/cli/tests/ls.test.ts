import { describe, test, expect, beforeEach } from "bun:test";
import { $ } from "bun";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { ls, lsAll, type LsEntry, type LsAllEntry } from "../src/commands/ls.js";
import { cleanTestHome, getGlobalSkillsPath, getProjectSkillsPath, getRegistryPath, getBskDir } from "../src/utils/paths.js";

const cli = join(import.meta.dir, "../src/cli.ts");

describe("ls", () => {
  beforeEach(async () => {
    await cleanTestHome();
  });

  test("returns empty array when no skills installed", async () => {
    const entries = await ls();
    expect(entries).toEqual([]);
  });

  test("shows skill only in global", async () => {
    await mkdir(join(getGlobalSkillsPath(), "my-skill"), { recursive: true });
    await writeFile(join(getGlobalSkillsPath(), "my-skill", "SKILL.md"), "---\nname: my-skill\n---\n");

    const entries = await ls();
    expect(entries).toEqual([
      { name: "my-skill", global: true, project: false },
    ]);
  });

  test("shows skill only in project", async () => {
    await mkdir(join(getProjectSkillsPath(), "local-skill"), { recursive: true });
    await writeFile(join(getProjectSkillsPath(), "local-skill", "SKILL.md"), "---\nname: local-skill\n---\n");

    const entries = await ls();
    expect(entries).toEqual([
      { name: "local-skill", global: false, project: true },
    ]);
  });

  test("shows skill in both global and project", async () => {
    await mkdir(join(getGlobalSkillsPath(), "shared-skill"), { recursive: true });
    await writeFile(join(getGlobalSkillsPath(), "shared-skill", "SKILL.md"), "---\nname: shared-skill\n---\n");
    await mkdir(join(getProjectSkillsPath(), "shared-skill"), { recursive: true });
    await writeFile(join(getProjectSkillsPath(), "shared-skill", "SKILL.md"), "---\nname: shared-skill\n---\n");

    const entries = await ls();
    expect(entries).toEqual([
      { name: "shared-skill", global: true, project: true },
    ]);
  });

  test("merges and sorts skills from both sources", async () => {
    await mkdir(join(getGlobalSkillsPath(), "zeta"), { recursive: true });
    await mkdir(join(getGlobalSkillsPath(), "alpha"), { recursive: true });
    await mkdir(join(getProjectSkillsPath(), "beta"), { recursive: true });

    const entries = await ls();
    expect(entries.map((e) => e.name)).toEqual(["alpha", "beta", "zeta"]);
  });
});

describe("lsAll", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getBskDir(), { recursive: true });
  });

  test("returns empty array when registry does not exist", async () => {
    const entries = await lsAll();
    expect(entries).toEqual([]);
  });

  test("returns empty array when registry has no skills", async () => {
    await writeFile(getRegistryPath(), JSON.stringify({ skills: {} }));
    const entries = await lsAll();
    expect(entries).toEqual([]);
  });

  test("returns all registered skills sorted by name", async () => {
    await writeFile(
      getRegistryPath(),
      JSON.stringify({
        skills: {
          "zeta-skill": { versions: [{ v: 1, hash: "aaa111", source: "owner/zeta", addedAt: "2026-03-01T00:00:00.000Z" }] },
          "alpha-skill": { versions: [{ v: 1, hash: "bbb222", source: "owner/alpha", addedAt: "2026-03-01T00:00:00.000Z" }] },
        },
      })
    );
    const entries = await lsAll();
    expect(entries).toEqual([
      { name: "alpha-skill", hash: "bbb222", source: "owner/alpha", v: 1 },
      { name: "zeta-skill", hash: "aaa111", source: "owner/zeta", v: 1 },
    ]);
  });

  test("returns single registered skill", async () => {
    await writeFile(
      getRegistryPath(),
      JSON.stringify({
        skills: {
          "my-skill": { versions: [{ v: 1, hash: "abc123def456", source: "https://github.com/foo/bar", addedAt: "2026-03-01T00:00:00.000Z" }] },
        },
      })
    );
    const entries = await lsAll();
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
