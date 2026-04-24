import { describe, test, expect, beforeEach } from "bun:test";
import { mkdir, writeFile, readdir, readFile } from "fs/promises";
import { join } from "path";
import { profileApply } from "../src/commands/profile.js";
import { type Profile, writeProfile } from "../src/core/profile.js";
import { registerSkill } from "../src/core/registry.js";
import { hashDirectory } from "../src/core/hasher.js";
import { cpRecursive } from "../src/core/linker.js";
import { cleanTestHome, getProfilesPath, getStorePath, getProjectSkillsPath, getProfilePath, home } from "../src/utils/paths.js";

function projectSkillsPath(): string {
  const path = getProjectSkillsPath();
  if (!path) throw new Error("Expected project skills path in test mode");
  return path;
}

describe("profile apply", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getProfilesPath(), { recursive: true });
    await mkdir(getStorePath(), { recursive: true });
  });

  /** Helper: create a skill in the store and register it */
  async function setupSkill(name: string, content: string): Promise<{ hash: string }> {
    const tmpSkill = join(home(), `tmp-${name}`);
    await mkdir(tmpSkill, { recursive: true });
    await writeFile(join(tmpSkill, "SKILL.md"), content);
    const hash = await hashDirectory(tmpSkill);
    const storeDir = join(getStorePath(), hash);
    await mkdir(storeDir, { recursive: true });
    await cpRecursive(tmpSkill, storeDir);
    await registerSkill(name, hash, "test/repo");
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
    await writeProfile(getProfilePath("dev"), profile);

    await profileApply("dev", {});

    const entries = (await readdir(projectSkillsPath())).sort();
    expect(entries).toEqual(["skill-a", "skill-b"]);

    const contentA = await readFile(join(projectSkillsPath(), "skill-a", "SKILL.md"), "utf-8");
    expect(contentA).toContain("Skill A");
  });

  test("merge mode skips existing project skills", async () => {
    await setupSkill("skill-a", "# Skill A");
    await setupSkill("skill-b", "# Skill B");

    await mkdir(join(projectSkillsPath(), "skill-a"), { recursive: true });
    await writeFile(join(projectSkillsPath(), "skill-a", "SKILL.md"), "# Custom A");

    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "skill-a", v: 1, source: "test/repo", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "skill-b", v: 1, source: "test/repo", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("dev"), profile);

    await profileApply("dev", {});

    const contentA = await readFile(join(projectSkillsPath(), "skill-a", "SKILL.md"), "utf-8");
    expect(contentA).toBe("# Custom A");

    const entries = (await readdir(projectSkillsPath())).sort();
    expect(entries).toEqual(["skill-a", "skill-b"]);
  });

  test("replace mode clears existing project skills", async () => {
    await setupSkill("skill-b", "# Skill B");
    await setupSkill("skill-c", "# Skill C");

    await mkdir(join(projectSkillsPath(), "old-skill"), { recursive: true });
    await writeFile(join(projectSkillsPath(), "old-skill", "SKILL.md"), "# Old");

    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "skill-b", v: 1, source: "test/repo", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "skill-c", v: 1, source: "test/repo", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(getProfilePath("dev"), profile);

    await profileApply("dev", { replace: true });

    const entries = (await readdir(projectSkillsPath())).sort();
    expect(entries).toEqual(["skill-b", "skill-c"]);
  });

  test("empty profile prints message and makes no changes", async () => {
    const profile: Profile = { name: "empty", skills: [] };
    await writeProfile(getProfilePath("empty"), profile);

    await profileApply("empty", {});

    await expect(readdir(projectSkillsPath())).rejects.toThrow();
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
    await writeProfile(getProfilePath("dev"), profile);

    await profileApply("dev", {});

    const entries = await readdir(projectSkillsPath());
    expect(entries).toEqual(["skill-a"]);
  });

  test("throws for nonexistent profile", async () => {
    expect(
      profileApply("nope", {})
    ).rejects.toThrow();
  });

});
