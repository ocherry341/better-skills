import { describe, test, expect, beforeEach } from "bun:test";
import { mkdir, writeFile, readFile, readdir } from "fs/promises";
import { join } from "path";
import { readRegistry, registerSkill } from "../src/core/registry.js";
import { readProfile, writeProfile, setActiveProfileName, getActiveProfileName } from "../src/core/profile.js";
import { hashDirectory } from "../src/core/hasher.js";
import * as store from "../src/core/store.js";
import { save } from "../src/commands/save.js";
import { cleanTestHome, getGlobalSkillsPath, getStorePath, getProfilesPath, getProfilePath } from "../src/utils/paths.js";

describe("save command", () => {
  beforeEach(async () => {
    await cleanTestHome();
    await mkdir(getGlobalSkillsPath(), { recursive: true });
    await mkdir(getStorePath(), { recursive: true });
    await mkdir(getProfilesPath(), { recursive: true });
  });

  test("saves new unmanaged skill to store and registry", async () => {
    const skill = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "---\nname: my-skill\n---\n# S");

    await save();

    const reg = await readRegistry();
    expect(reg.skills["my-skill"]).toBeDefined();
    expect(reg.skills["my-skill"].versions).toHaveLength(1);
    expect(reg.skills["my-skill"].versions[0].v).toBe(1);
    expect(reg.skills["my-skill"].versions[0].source).toBe("local");
  });

  test("saves specific skill by name", async () => {
    const skill1 = join(getGlobalSkillsPath(), "skill-a");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "# A");

    const skill2 = join(getGlobalSkillsPath(), "skill-b");
    await mkdir(skill2, { recursive: true });
    await writeFile(join(skill2, "SKILL.md"), "# B");

    await save({ skillName: "skill-a" });

    const reg = await readRegistry();
    expect(reg.skills["skill-a"]).toBeDefined();
    expect(reg.skills).not.toHaveProperty("skill-b");
  });

  test("skips skill when hash matches latest version (idempotent)", async () => {
    const skill = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "---\nname: my-skill\n---\n# S");

    // Save once
    await save();

    // Save again — should be idempotent
    await save();

    const reg = await readRegistry();
    expect(reg.skills["my-skill"].versions).toHaveLength(1);
  });

  test("creates new version when content has changed", async () => {
    const skill = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "version 1");

    await save();

    // Modify the skill
    await writeFile(join(skill, "SKILL.md"), "version 2");

    await save();

    const reg = await readRegistry();
    expect(reg.skills["my-skill"].versions).toHaveLength(2);
    expect(reg.skills["my-skill"].versions[0].v).toBe(1);
    expect(reg.skills["my-skill"].versions[1].v).toBe(2);
  });

  test("creates default profile when none exists", async () => {
    const skill = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "# S");

    expect(await getActiveProfileName()).toBeNull();

    await save();

    expect(await getActiveProfileName()).toBe("default");
    const profile = await readProfile(getProfilePath("default"));
    expect(profile.skills).toHaveLength(1);
    expect(profile.skills[0].skillName).toBe("my-skill");
    expect(profile.skills[0].v).toBe(1);
  });

  test("updates active profile with new version", async () => {
    await writeProfile(getProfilePath("dev"), { name: "dev", skills: [] });
    await setActiveProfileName("dev");

    const skill = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "v1");
    await save();

    await writeFile(join(skill, "SKILL.md"), "v2");
    await save();

    const profile = await readProfile(getProfilePath("dev"));
    expect(profile.skills).toHaveLength(1);
    expect(profile.skills[0].v).toBe(2);
  });

  test("no skills: prints message and exits", async () => {
    const { rm } = await import("fs/promises");
    await rm(getGlobalSkillsPath(), { recursive: true, force: true });
    await save();
    // Should not throw
  });

  test("empty skills dir: prints message and exits", async () => {
    await save();
    // Should not throw
  });

  test("re-links files from store after save", async () => {
    const skill = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "---\nname: my-skill\n---\n# Skill");

    await save();

    // Content should be intact
    const content = await readFile(join(skill, "SKILL.md"), "utf-8");
    expect(content).toBe("---\nname: my-skill\n---\n# Skill");
  });

  test("skips already managed skills with same hash", async () => {
    const skill1 = join(getGlobalSkillsPath(), "managed-skill");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: managed-skill\n---\n# M");
    const hash = await hashDirectory(skill1);
    await store.store(hash, skill1);
    await mkdir(join(getStorePath(), hash), { recursive: true });
    await registerSkill("managed-skill", hash, "owner/repo");

    const skill2 = join(getGlobalSkillsPath(), "new-skill");
    await mkdir(skill2, { recursive: true });
    await writeFile(join(skill2, "SKILL.md"), "---\nname: new-skill\n---\n# N");

    await save();

    const reg = await readRegistry();
    expect(reg.skills["managed-skill"].versions[0].source).toBe("owner/repo");
    expect(reg.skills["new-skill"].versions[0].source).toBe("local");
  });

  test("adds to existing active profile", async () => {
    await writeProfile(getProfilePath("work"), { name: "work", skills: [] });
    await setActiveProfileName("work");

    const skill1 = join(getGlobalSkillsPath(), "my-skill");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: my-skill\n---\n# S");

    await save();

    expect(await getActiveProfileName()).toBe("work");
    const profile = await readProfile(getProfilePath("work"));
    expect(profile.skills).toHaveLength(1);
    expect(profile.skills[0].skillName).toBe("my-skill");
    expect(profile.skills[0].v).toBe(1);
  });

  test("all managed with same hash: no new version added", async () => {
    const skill1 = join(getGlobalSkillsPath(), "managed");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: managed\n---\n# M");
    const hash = await hashDirectory(skill1);
    await mkdir(join(getStorePath(), hash), { recursive: true });
    await registerSkill("managed", hash, "owner/repo");

    await save();

    const reg = await readRegistry();
    expect(reg.skills["managed"].versions).toHaveLength(1);
    expect(reg.skills["managed"].versions[0].source).toBe("owner/repo");
  });

  test("re-copies store when existing store entry is incomplete", async () => {
    const skill1 = join(getGlobalSkillsPath(), "multi-file-skill");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: multi-file-skill\n---\n# S");
    await writeFile(join(skill1, "data.txt"), "important data");

    const expectedHash = await hashDirectory(skill1);

    // Simulate interrupted save: create store dir with only one file
    const hashPath = join(getStorePath(), expectedHash);
    await mkdir(hashPath, { recursive: true });
    await writeFile(join(hashPath, "SKILL.md"), "---\nname: multi-file-skill\n---\n# S");

    await save();

    const entries = (await readdir(skill1)).sort();
    expect(entries).toEqual([".bsk-meta.json", "SKILL.md", "data.txt"]);

    const content = await readFile(join(skill1, "data.txt"), "utf-8");
    expect(content).toBe("important data");

    const storeEntries = (await readdir(hashPath)).sort();
    expect(storeEntries).toEqual([".bsk-meta.json", "SKILL.md", "data.txt"]);
  });
});
