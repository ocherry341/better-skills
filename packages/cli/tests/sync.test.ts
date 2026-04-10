import { describe, test, expect, beforeEach } from "bun:test";
import { mkdir, readdir, writeFile, lstat, readlink, stat, rm } from "fs/promises";
import { join, dirname, basename } from "path";
import { ensureClientSymlink, writeConfig, getClientSkillsDir } from "../src/core/clients.js";
import { type Profile, writeProfile, setActiveProfileName } from "../src/core/profile.js";
import { registerSkill } from "../src/core/registry.js";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";
import { syncRestore, syncExport, syncImport, bskCd } from "../src/commands/sync.js";
import { cleanTestHome, getProfilesPath, getActiveProfileFilePath, getGlobalSkillsPath, getStorePath, getRegistryPath, getBskDir, getProfilePath, home } from "../src/utils/paths.js";

describe("ensureClientSymlink", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getGlobalSkillsPath(), { recursive: true });
  });

  test("creates symlink when path does not exist", async () => {
    const result = await ensureClientSymlink("claude", getGlobalSkillsPath());
    expect(result).toBe("created");
    const clientDir = getClientSkillsDir("claude");
    const st = await lstat(clientDir);
    expect(st.isSymbolicLink()).toBe(true);
    const target = await readlink(clientDir);
    expect(target).toBe(getGlobalSkillsPath());
  });

  test("no-op when correct symlink already exists", async () => {
    await ensureClientSymlink("claude", getGlobalSkillsPath());
    const result = await ensureClientSymlink("claude", getGlobalSkillsPath());
    expect(result).toBe("exists");
  });

  test("skips when path is a real directory", async () => {
    const clientDir = getClientSkillsDir("claude");
    await mkdir(clientDir, { recursive: true });
    await writeFile(join(clientDir, "something.md"), "content");
    const result = await ensureClientSymlink("claude", getGlobalSkillsPath());
    expect(result).toBe("skipped");
  });
});

describe("syncRestore", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
    await mkdir(getGlobalSkillsPath(), { recursive: true });
    await mkdir(getStorePath(), { recursive: true });
  });

  test("restores skills from active profile", async () => {
    const tmpSkill = join(home(), "tmp-skill");
    await mkdir(tmpSkill, { recursive: true });
    await writeFile(join(tmpSkill, "SKILL.md"), "---\nname: test-skill\n---\n# Test");
    const hash = await hashDirectory(tmpSkill);
    await mkdir(join(getStorePath(), hash), { recursive: true });
    await cpRecursive(tmpSkill, join(getStorePath(), hash));
    await registerSkill("test-skill", hash, "test/repo");

    const profile: Profile = {
      name: "myprofile",
      skills: [{ skillName: "test-skill", v: 1, source: "test/repo", addedAt: "2026-01-01T00:00:00.000Z" }],
    };
    await writeProfile(getProfilePath("myprofile"), profile);
    await setActiveProfileName(getActiveProfileFilePath(), "myprofile");

    await syncRestore();

    const entries = await readdir(getGlobalSkillsPath());
    expect(entries).toContain("test-skill");
  });

  test("restores 2 skills both in store", async () => {
    const tmpA = join(home(), "tmp-a");
    await mkdir(tmpA, { recursive: true });
    await writeFile(join(tmpA, "SKILL.md"), "# Skill A");
    const hashA = await hashDirectory(tmpA);
    await mkdir(join(getStorePath(), hashA), { recursive: true });
    await cpRecursive(tmpA, join(getStorePath(), hashA));
    await registerSkill("skill-a", hashA, "a/repo");

    const tmpB = join(home(), "tmp-b");
    await mkdir(tmpB, { recursive: true });
    await writeFile(join(tmpB, "SKILL.md"), "# Skill B");
    const hashB = await hashDirectory(tmpB);
    await mkdir(join(getStorePath(), hashB), { recursive: true });
    await cpRecursive(tmpB, join(getStorePath(), hashB));
    await registerSkill("skill-b", hashB, "b/repo");

    const profile: Profile = {
      name: "multi",
      skills: [
        { skillName: "skill-a", v: 1, source: "a/repo", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "skill-b", v: 1, source: "b/repo", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("multi"), profile);
    await setActiveProfileName(getActiveProfileFilePath(), "multi");

    await syncRestore();

    const entries = await readdir(getGlobalSkillsPath());
    expect(entries).toContain("skill-a");
    expect(entries).toContain("skill-b");
  });

  test("preserves unmanaged skills during restore", async () => {
    const unmanagedDir = join(getGlobalSkillsPath(), "my-custom-skill");
    await mkdir(unmanagedDir, { recursive: true });
    await writeFile(join(unmanagedDir, "SKILL.md"), "# Custom");

    const profile: Profile = { name: "p", skills: [] };
    await writeProfile(getProfilePath("p"), profile);
    await setActiveProfileName(getActiveProfileFilePath(), "p");

    await syncRestore();

    const entries = await readdir(getGlobalSkillsPath());
    expect(entries).toContain("my-custom-skill");
  });

  test("rebuilds client symlinks for enabled clients", async () => {
    const profile: Profile = { name: "p", skills: [] };
    await writeProfile(getProfilePath("p"), profile);
    await setActiveProfileName(getActiveProfileFilePath(), "p");

    await writeConfig({ clients: ["claude"] });

    await syncRestore();

    const clientDir = getClientSkillsDir("claude");
    const st = await lstat(clientDir);
    expect(st.isSymbolicLink()).toBe(true);
    const target = await readlink(clientDir);
    expect(target).toBe(getGlobalSkillsPath());
  });

  test("throws when no active profile", async () => {
    expect(
      syncRestore()
    ).rejects.toThrow(/No active profile/);
  });

  test("partial restore: skips missing skills gracefully", async () => {
    const profile: Profile = {
      name: "broken",
      skills: [{ skillName: "ghost", v: 99, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" }],
    };
    await writeProfile(getProfilePath("broken"), profile);
    await setActiveProfileName(getActiveProfileFilePath(), "broken");

    await syncRestore();

    const entries = await readdir(getGlobalSkillsPath());
    expect(entries).toEqual([]);
  });
});

describe("syncExport", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getBskDir(), { recursive: true });
    await writeFile(getRegistryPath(), '{"skills":{}}');
    await mkdir(getStorePath(), { recursive: true });
    await mkdir(getProfilesPath(), { recursive: true });
  });

  test("produces a valid tar.gz file at default path", async () => {
    const outputDir = join(home(), "output");
    await mkdir(outputDir, { recursive: true });
    const output = join(outputDir, "backup.tar.gz");

    await syncExport({ output });

    const st = await stat(output);
    expect(st.size).toBeGreaterThan(0);
  });

  test("archive contains bskDir contents", async () => {
    const output = join(home(), "backup.tar.gz");
    await syncExport({ output });

    const extractDir = join(home(), "extracted");
    await mkdir(extractDir, { recursive: true });
    const proc = Bun.spawn(["tar", "xzf", output, "-C", extractDir]);
    await proc.exited;

    const extractedEntries = await readdir(join(extractDir, "better-skills"));
    expect(extractedEntries).toContain("registry.json");
    expect(extractedEntries).toContain("store");
    expect(extractedEntries).toContain("profiles");
  });

  test("respects --output path", async () => {
    const customOutput = join(home(), "custom", "my-backup.tar.gz");
    await mkdir(join(home(), "custom"), { recursive: true });

    await syncExport({ output: customOutput });

    const st = await stat(customOutput);
    expect(st.size).toBeGreaterThan(0);
  });

  test("excludes .git directory from archive", async () => {
    await mkdir(join(getBskDir(), ".git"), { recursive: true });
    await writeFile(join(getBskDir(), ".git", "HEAD"), "ref: refs/heads/main");

    const output = join(home(), "backup.tar.gz");
    await syncExport({ output });

    const extractDir = join(home(), "extracted");
    await mkdir(extractDir, { recursive: true });
    const proc = Bun.spawn(["tar", "xzf", output, "-C", extractDir]);
    await proc.exited;

    const extractedEntries = await readdir(join(extractDir, "better-skills"));
    expect(extractedEntries).not.toContain(".git");
    expect(extractedEntries).toContain("registry.json");
  });

  test("throws when bskDir does not exist", async () => {
    await rm(getBskDir(), { recursive: true, force: true });
    expect(
      syncExport({ output: join(home(), "out.tar.gz") })
    ).rejects.toThrow();
  });
});

describe("syncImport", () => {
  beforeEach(async () => {
    await cleanTestHome();
  });

  test("extracts tar.gz to bskDir", async () => {
    await mkdir(getBskDir(), { recursive: true });
    await writeFile(getRegistryPath(), '{"skills":{}}');
    await mkdir(getProfilesPath(), { recursive: true });
    await writeFile(getActiveProfileFilePath(), "default\n");
    await writeFile(getProfilePath("default"), JSON.stringify({ name: "default", skills: [] }));

    const archivePath = join(home(), "backup.tar.gz");
    const proc = Bun.spawn(["tar", "czf", archivePath, "-C", dirname(getBskDir()), basename(getBskDir())]);
    await proc.exited;

    await rm(getBskDir(), { recursive: true, force: true });

    await mkdir(getGlobalSkillsPath(), { recursive: true });
    await syncImport(archivePath, { yes: true });

    const entries = await readdir(getBskDir());
    expect(entries).toContain("registry.json");
    expect(entries).toContain("profiles");
  });

  test("throws on non-existent archive file", async () => {
    expect(
      syncImport(join(home(), "nonexistent.tar.gz"), { yes: true })
    ).rejects.toThrow();
  });
});

describe("bskCd", () => {
  beforeEach(async () => {
    await cleanTestHome();
  });

  test("throws when bskDir does not exist", async () => {
    expect(
      bskCd()
    ).rejects.toThrow();
  });

  test("spawns shell with correct cwd", async () => {
    await mkdir(getBskDir(), { recursive: true });

    const result = await bskCd(["pwd"]);
    expect(result).toBe(getBskDir());
  });
});
