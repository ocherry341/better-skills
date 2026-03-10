import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { save } from "../src/commands/save.js";
import { readRegistry } from "../src/core/registry.js";
import { readProfile, writeProfile, setActiveProfileName, getActiveProfileName } from "../src/core/profile.js";

describe("save command", () => {
  let baseDir: string;
  let skillsDir: string;
  let registryPath: string;
  let storeDir: string;
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "save-"));
    skillsDir = join(baseDir, "skills");
    registryPath = join(baseDir, "registry.json");
    storeDir = join(baseDir, "store");
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    await mkdir(skillsDir, { recursive: true });
    await mkdir(storeDir, { recursive: true });
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  function opts(skillName?: string) {
    return {
      skillName,
      skillsDir,
      registryPath,
      storePath: storeDir,
      profilesDir,
      activeFile,
    };
  }

  test("saves new unmanaged skill to store and registry", async () => {
    const skill = join(skillsDir, "my-skill");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "---\nname: my-skill\n---\n# S");

    await save(opts());

    const reg = await readRegistry(registryPath);
    expect(reg.skills["my-skill"]).toBeDefined();
    expect(reg.skills["my-skill"].versions).toHaveLength(1);
    expect(reg.skills["my-skill"].versions[0].v).toBe(1);
    expect(reg.skills["my-skill"].versions[0].source).toBe("local");
  });

  test("saves specific skill by name", async () => {
    const skill1 = join(skillsDir, "skill-a");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "# A");

    const skill2 = join(skillsDir, "skill-b");
    await mkdir(skill2, { recursive: true });
    await writeFile(join(skill2, "SKILL.md"), "# B");

    await save(opts("skill-a"));

    const reg = await readRegistry(registryPath);
    expect(reg.skills["skill-a"]).toBeDefined();
    expect(reg.skills).not.toHaveProperty("skill-b");
  });

  test("skips skill when hash matches latest version (idempotent)", async () => {
    const skill = join(skillsDir, "my-skill");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "---\nname: my-skill\n---\n# S");

    // Save once
    await save(opts());

    // Save again — should be idempotent
    await save(opts());

    const reg = await readRegistry(registryPath);
    expect(reg.skills["my-skill"].versions).toHaveLength(1);
  });

  test("creates new version when content has changed", async () => {
    const skill = join(skillsDir, "my-skill");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "version 1");

    await save(opts());

    // Modify the skill
    await writeFile(join(skill, "SKILL.md"), "version 2");

    await save(opts());

    const reg = await readRegistry(registryPath);
    expect(reg.skills["my-skill"].versions).toHaveLength(2);
    expect(reg.skills["my-skill"].versions[0].v).toBe(1);
    expect(reg.skills["my-skill"].versions[1].v).toBe(2);
  });

  test("creates default profile when none exists", async () => {
    const skill = join(skillsDir, "my-skill");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "# S");

    expect(await getActiveProfileName(activeFile)).toBeNull();

    await save(opts());

    expect(await getActiveProfileName(activeFile)).toBe("default");
    const profile = await readProfile(join(profilesDir, "default.json"));
    expect(profile.skills).toHaveLength(1);
    expect(profile.skills[0].skillName).toBe("my-skill");
    expect(profile.skills[0].v).toBe(1);
  });

  test("updates active profile with new version", async () => {
    await writeProfile(join(profilesDir, "dev.json"), { name: "dev", skills: [] });
    await setActiveProfileName(activeFile, "dev");

    const skill = join(skillsDir, "my-skill");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "v1");
    await save(opts());

    await writeFile(join(skill, "SKILL.md"), "v2");
    await save(opts());

    const profile = await readProfile(join(profilesDir, "dev.json"));
    expect(profile.skills).toHaveLength(1);
    expect(profile.skills[0].v).toBe(2);
  });

  test("no skills: prints message and exits", async () => {
    await rm(skillsDir, { recursive: true, force: true });
    await save(opts());
    // Should not throw
  });

  test("empty skills dir: prints message and exits", async () => {
    await save(opts());
    // Should not throw
  });

  test("re-links files from store after save", async () => {
    const skill = join(skillsDir, "my-skill");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "---\nname: my-skill\n---\n# Skill");

    await save(opts());

    // Content should be intact
    const content = await readFile(join(skill, "SKILL.md"), "utf-8");
    expect(content).toBe("---\nname: my-skill\n---\n# Skill");
  });
});
