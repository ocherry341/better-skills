import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, readdir, writeFile, readFile, lstat, readlink, symlink, stat } from "fs/promises";
import { join, dirname, basename } from "path";
import { tmpdir } from "os";
import { ensureClientSymlink, writeConfig } from "../src/core/clients.js";
import { restoreSkillsFromProfile } from "../src/core/restore.js";
import { type Profile, readProfile, writeProfile, getActiveProfileName, setActiveProfileName } from "../src/core/profile.js";
import { registerSkill } from "../src/core/registry.js";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";
import { syncRestore, syncExport, syncImport, bskCd } from "../src/commands/sync.js";

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

describe("syncRestore", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;
  let skillsDir: string;
  let storePath: string;
  let registryPath: string;
  let configPath: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "sync-restore-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    skillsDir = join(baseDir, "skills");
    storePath = join(baseDir, "store");
    registryPath = join(baseDir, "registry.json");
    configPath = join(baseDir, "config.json");
    await mkdir(profilesDir, { recursive: true });
    await mkdir(skillsDir, { recursive: true });
    await mkdir(storePath, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("restores skills from active profile", async () => {
    const tmpSkill = join(baseDir, "tmp-skill");
    await mkdir(tmpSkill, { recursive: true });
    await writeFile(join(tmpSkill, "SKILL.md"), "---\nname: test-skill\n---\n# Test");
    const hash = await hashDirectory(tmpSkill);
    await mkdir(join(storePath, hash), { recursive: true });
    await cpRecursive(tmpSkill, join(storePath, hash));
    await registerSkill("test-skill", hash, "test/repo", registryPath, storePath);

    const profile: Profile = {
      name: "myprofile",
      skills: [{ skillName: "test-skill", v: 1, source: "test/repo", addedAt: "2026-01-01T00:00:00.000Z" }],
    };
    await writeProfile(join(profilesDir, "myprofile.json"), profile);
    await setActiveProfileName(activeFile, "myprofile");

    await syncRestore({
      profilesDir, activeFile, skillsDir, storePath, registryPath, configPath,
    });

    const entries = await readdir(skillsDir);
    expect(entries).toContain("test-skill");
  });

  test("restores 2 skills both in store", async () => {
    const tmpA = join(baseDir, "tmp-a");
    await mkdir(tmpA, { recursive: true });
    await writeFile(join(tmpA, "SKILL.md"), "# Skill A");
    const hashA = await hashDirectory(tmpA);
    await mkdir(join(storePath, hashA), { recursive: true });
    await cpRecursive(tmpA, join(storePath, hashA));
    await registerSkill("skill-a", hashA, "a/repo", registryPath, storePath);

    const tmpB = join(baseDir, "tmp-b");
    await mkdir(tmpB, { recursive: true });
    await writeFile(join(tmpB, "SKILL.md"), "# Skill B");
    const hashB = await hashDirectory(tmpB);
    await mkdir(join(storePath, hashB), { recursive: true });
    await cpRecursive(tmpB, join(storePath, hashB));
    await registerSkill("skill-b", hashB, "b/repo", registryPath, storePath);

    const profile: Profile = {
      name: "multi",
      skills: [
        { skillName: "skill-a", v: 1, source: "a/repo", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "skill-b", v: 1, source: "b/repo", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "multi.json"), profile);
    await setActiveProfileName(activeFile, "multi");

    await syncRestore({
      profilesDir, activeFile, skillsDir, storePath, registryPath, configPath,
    });

    const entries = await readdir(skillsDir);
    expect(entries).toContain("skill-a");
    expect(entries).toContain("skill-b");
  });

  test("preserves unmanaged skills during restore", async () => {
    const unmanagedDir = join(skillsDir, "my-custom-skill");
    await mkdir(unmanagedDir, { recursive: true });
    await writeFile(join(unmanagedDir, "SKILL.md"), "# Custom");

    const profile: Profile = { name: "p", skills: [] };
    await writeProfile(join(profilesDir, "p.json"), profile);
    await setActiveProfileName(activeFile, "p");

    await syncRestore({
      profilesDir, activeFile, skillsDir, storePath, registryPath, configPath,
    });

    const entries = await readdir(skillsDir);
    expect(entries).toContain("my-custom-skill");
  });

  test("rebuilds client symlinks for enabled clients", async () => {
    const profile: Profile = { name: "p", skills: [] };
    await writeProfile(join(profilesDir, "p.json"), profile);
    await setActiveProfileName(activeFile, "p");

    const clientDir = join(baseDir, "claude-skills");
    await writeConfig({ clients: ["claude"] }, configPath);

    await syncRestore({
      profilesDir, activeFile, skillsDir, storePath, registryPath, configPath,
      clientDirOverrides: { claude: clientDir },
    });

    const st = await lstat(clientDir);
    expect(st.isSymbolicLink()).toBe(true);
    const target = await readlink(clientDir);
    expect(target).toBe(skillsDir);
  });

  test("throws when no active profile", async () => {
    expect(
      syncRestore({
        profilesDir, activeFile, skillsDir, storePath, registryPath, configPath,
      })
    ).rejects.toThrow(/No active profile/);
  });

  test("partial restore: skips missing skills gracefully", async () => {
    const profile: Profile = {
      name: "broken",
      skills: [{ skillName: "ghost", v: 99, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" }],
    };
    await writeProfile(join(profilesDir, "broken.json"), profile);
    await setActiveProfileName(activeFile, "broken");

    await syncRestore({
      profilesDir, activeFile, skillsDir, storePath, registryPath, configPath,
    });

    const entries = await readdir(skillsDir);
    expect(entries).toEqual([]);
  });
});

describe("syncExport", () => {
  let baseDir: string;
  let bskDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "sync-export-"));
    bskDir = join(baseDir, "better-skills");
    await mkdir(bskDir, { recursive: true });
    await writeFile(join(bskDir, "registry.json"), '{"skills":{}}');
    await mkdir(join(bskDir, "store"), { recursive: true });
    await mkdir(join(bskDir, "profiles"), { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("produces a valid tar.gz file at default path", async () => {
    const outputDir = join(baseDir, "output");
    await mkdir(outputDir, { recursive: true });
    const output = join(outputDir, "backup.tar.gz");

    await syncExport({ bskDir, output });

    const st = await stat(output);
    expect(st.size).toBeGreaterThan(0);
  });

  test("archive contains bskDir contents", async () => {
    const output = join(baseDir, "backup.tar.gz");
    await syncExport({ bskDir, output });

    const extractDir = join(baseDir, "extracted");
    await mkdir(extractDir, { recursive: true });
    const proc = Bun.spawn(["tar", "xzf", output, "-C", extractDir]);
    await proc.exited;

    const extractedEntries = await readdir(join(extractDir, "better-skills"));
    expect(extractedEntries).toContain("registry.json");
    expect(extractedEntries).toContain("store");
    expect(extractedEntries).toContain("profiles");
  });

  test("respects --output path", async () => {
    const customOutput = join(baseDir, "custom", "my-backup.tar.gz");
    await mkdir(join(baseDir, "custom"), { recursive: true });

    await syncExport({ bskDir, output: customOutput });

    const st = await stat(customOutput);
    expect(st.size).toBeGreaterThan(0);
  });

  test("excludes .git directory from archive", async () => {
    await mkdir(join(bskDir, ".git"), { recursive: true });
    await writeFile(join(bskDir, ".git", "HEAD"), "ref: refs/heads/main");

    const output = join(baseDir, "backup.tar.gz");
    await syncExport({ bskDir, output });

    const extractDir = join(baseDir, "extracted");
    await mkdir(extractDir, { recursive: true });
    const proc = Bun.spawn(["tar", "xzf", output, "-C", extractDir]);
    await proc.exited;

    const extractedEntries = await readdir(join(extractDir, "better-skills"));
    expect(extractedEntries).not.toContain(".git");
    expect(extractedEntries).toContain("registry.json");
  });

  test("throws when bskDir does not exist", async () => {
    expect(
      syncExport({ bskDir: join(baseDir, "nonexistent"), output: join(baseDir, "out.tar.gz") })
    ).rejects.toThrow();
  });
});

describe("syncImport", () => {
  let baseDir: string;
  let bskDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "sync-import-"));
    bskDir = join(baseDir, "better-skills");
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("extracts tar.gz to bskDir", async () => {
    await mkdir(bskDir, { recursive: true });
    await writeFile(join(bskDir, "registry.json"), '{"skills":{}}');
    await mkdir(join(bskDir, "profiles"), { recursive: true });
    await writeFile(join(bskDir, "active-profile"), "default\n");
    await writeFile(join(bskDir, "profiles", "default.json"), JSON.stringify({ name: "default", skills: [] }));

    const archivePath = join(baseDir, "backup.tar.gz");
    const proc = Bun.spawn(["tar", "czf", archivePath, "-C", dirname(bskDir), basename(bskDir)]);
    await proc.exited;

    await rm(bskDir, { recursive: true, force: true });

    const skillsDir = join(baseDir, "agents-skills");
    await mkdir(skillsDir, { recursive: true });
    await syncImport(archivePath, {
      yes: true,
      bskDir,
      skillsDir,
    });

    const entries = await readdir(bskDir);
    expect(entries).toContain("registry.json");
    expect(entries).toContain("profiles");
  });

  test("throws on non-existent archive file", async () => {
    expect(
      syncImport(join(baseDir, "nonexistent.tar.gz"), { yes: true, bskDir, skillsDir: join(baseDir, "skills") })
    ).rejects.toThrow();
  });
});

describe("bskCd", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "bsk-cd-"));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("throws when bskDir does not exist", async () => {
    expect(
      bskCd(join(baseDir, "nonexistent"))
    ).rejects.toThrow();
  });

  test("spawns shell with correct cwd", async () => {
    const bskDir = join(baseDir, "better-skills");
    await mkdir(bskDir, { recursive: true });

    const result = await bskCd(bskDir, ["pwd"]);
    expect(result).toBe(bskDir);
  });
});
