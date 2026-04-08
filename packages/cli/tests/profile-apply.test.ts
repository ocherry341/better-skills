import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { profileApply } from "../src/commands/profile.js";
import { type Profile, writeProfile } from "../src/core/profile.js";
import { registerSkill } from "../src/core/registry.js";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";

describe("profile apply", () => {
  let baseDir: string;
  let profilesDir: string;
  let storePath: string;
  let registryPath: string;
  let projectSkillsDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "profile-apply-"));
    profilesDir = join(baseDir, "profiles");
    storePath = join(baseDir, "store");
    registryPath = join(baseDir, "registry.json");
    projectSkillsDir = join(baseDir, "project-skills");
    await mkdir(profilesDir, { recursive: true });
    await mkdir(storePath, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  /** Helper: create a skill in the store and register it */
  async function setupSkill(name: string, content: string): Promise<{ hash: string }> {
    const tmpSkill = join(baseDir, `tmp-${name}`);
    await mkdir(tmpSkill, { recursive: true });
    await writeFile(join(tmpSkill, "SKILL.md"), content);
    const hash = await hashDirectory(tmpSkill);
    const storeDir = join(storePath, hash);
    await mkdir(storeDir, { recursive: true });
    await cpRecursive(tmpSkill, storeDir);
    await registerSkill(name, hash, "test/repo", registryPath, storePath);
    return { hash };
  }

  test("applies profile skills to empty project directory", async () => {
    await setupSkill("skill-a", "# Skill A");
    await setupSkill("skill-b", "# Skill B");

    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "skill-a", v: 1, source: "test/repo", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "skill-b", v: 1, source: "test/repo", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);

    await profileApply("dev", {
      profilesDir,
      storePath,
      projectSkillsDir,
      registryPath,
    });

    const entries = (await readdir(projectSkillsDir)).sort();
    expect(entries).toEqual(["skill-a", "skill-b"]);

    const contentA = await readFile(join(projectSkillsDir, "skill-a", "SKILL.md"), "utf-8");
    expect(contentA).toContain("Skill A");
  });

  test("merge mode skips existing project skills", async () => {
    await setupSkill("skill-a", "# Skill A");
    await setupSkill("skill-b", "# Skill B");

    await mkdir(join(projectSkillsDir, "skill-a"), { recursive: true });
    await writeFile(join(projectSkillsDir, "skill-a", "SKILL.md"), "# Custom A");

    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "skill-a", v: 1, source: "test/repo", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "skill-b", v: 1, source: "test/repo", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);

    await profileApply("dev", {
      profilesDir,
      storePath,
      projectSkillsDir,
      registryPath,
    });

    const contentA = await readFile(join(projectSkillsDir, "skill-a", "SKILL.md"), "utf-8");
    expect(contentA).toBe("# Custom A");

    const entries = (await readdir(projectSkillsDir)).sort();
    expect(entries).toEqual(["skill-a", "skill-b"]);
  });

  test("replace mode clears existing project skills", async () => {
    await setupSkill("skill-b", "# Skill B");
    await setupSkill("skill-c", "# Skill C");

    await mkdir(join(projectSkillsDir, "old-skill"), { recursive: true });
    await writeFile(join(projectSkillsDir, "old-skill", "SKILL.md"), "# Old");

    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "skill-b", v: 1, source: "test/repo", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "skill-c", v: 1, source: "test/repo", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);

    await profileApply("dev", {
      profilesDir,
      storePath,
      projectSkillsDir,
      registryPath,
      replace: true,
    });

    const entries = (await readdir(projectSkillsDir)).sort();
    expect(entries).toEqual(["skill-b", "skill-c"]);
  });

  test("empty profile prints message and makes no changes", async () => {
    const profile: Profile = { name: "empty", skills: [] };
    await writeProfile(join(profilesDir, "empty.json"), profile);

    await profileApply("empty", {
      profilesDir,
      storePath,
      projectSkillsDir,
      registryPath,
    });

    await expect(readdir(projectSkillsDir)).rejects.toThrow();
  });

  test("skips skills not found in registry", async () => {
    await setupSkill("skill-a", "# Skill A");

    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "skill-a", v: 1, source: "test/repo", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "ghost", v: 99, source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);

    await profileApply("dev", {
      profilesDir,
      storePath,
      projectSkillsDir,
      registryPath,
    });

    const entries = await readdir(projectSkillsDir);
    expect(entries).toEqual(["skill-a"]);
  });

  test("throws for nonexistent profile", async () => {
    expect(
      profileApply("nope", {
        profilesDir,
        storePath,
        projectSkillsDir,
        registryPath,
      })
    ).rejects.toThrow();
  });
});
