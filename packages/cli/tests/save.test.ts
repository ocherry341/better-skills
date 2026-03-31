import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { readRegistry, registerSkill } from "../src/core/registry.js";
import { readProfile, writeProfile, setActiveProfileName, getActiveProfileName } from "../src/core/profile.js";
import { hashDirectory } from "../src/core/hasher.js";
import * as store from "../src/core/store.js";
import { save } from "../src/commands/save.js";

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

  test("skips already managed skills with same hash", async () => {
    const skill1 = join(skillsDir, "managed-skill");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: managed-skill\n---\n# M");
    const hash = await hashDirectory(skill1);
    await store.store(hash, skill1);
    await mkdir(join(storeDir, hash), { recursive: true });
    await registerSkill("managed-skill", hash, "owner/repo", registryPath, storeDir);

    const skill2 = join(skillsDir, "new-skill");
    await mkdir(skill2, { recursive: true });
    await writeFile(join(skill2, "SKILL.md"), "---\nname: new-skill\n---\n# N");

    await save(opts());

    const reg = await readRegistry(registryPath);
    expect(reg.skills["managed-skill"].versions[0].source).toBe("owner/repo");
    expect(reg.skills["new-skill"].versions[0].source).toBe("local");
  });

  test("adds to existing active profile", async () => {
    await writeProfile(join(profilesDir, "work.json"), { name: "work", skills: [] });
    await setActiveProfileName(activeFile, "work");

    const skill1 = join(skillsDir, "my-skill");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: my-skill\n---\n# S");

    await save(opts());

    expect(await getActiveProfileName(activeFile)).toBe("work");
    const profile = await readProfile(join(profilesDir, "work.json"));
    expect(profile.skills).toHaveLength(1);
    expect(profile.skills[0].skillName).toBe("my-skill");
    expect(profile.skills[0].v).toBe(1);
  });

  test("all managed with same hash: no new version added", async () => {
    const skill1 = join(skillsDir, "managed");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: managed\n---\n# M");
    const hash = await hashDirectory(skill1);
    await mkdir(join(storeDir, hash), { recursive: true });
    await registerSkill("managed", hash, "owner/repo", registryPath, storeDir);

    await save(opts());

    const reg = await readRegistry(registryPath);
    expect(reg.skills["managed"].versions).toHaveLength(1);
    expect(reg.skills["managed"].versions[0].source).toBe("owner/repo");
  });

  test("re-copies store when existing store entry is incomplete", async () => {
    const skill1 = join(skillsDir, "multi-file-skill");
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: multi-file-skill\n---\n# S");
    await writeFile(join(skill1, "data.txt"), "important data");

    const expectedHash = await hashDirectory(skill1);

    // Simulate interrupted save: create store dir with only one file
    const hashPath = join(storeDir, expectedHash);
    await mkdir(hashPath, { recursive: true });
    await writeFile(join(hashPath, "SKILL.md"), "---\nname: multi-file-skill\n---\n# S");

    await save(opts());

    const entries = (await readdir(skill1)).sort();
    expect(entries).toEqual([".bsk-meta.json", "SKILL.md", "data.txt"]);

    const content = await readFile(join(skill1, "data.txt"), "utf-8");
    expect(content).toBe("important data");

    const storeEntries = (await readdir(hashPath)).sort();
    expect(storeEntries).toEqual([".bsk-meta.json", "SKILL.md", "data.txt"]);
  });
});

describe("save --adopt-orphans", () => {
  let baseDir: string;
  let skillsDir: string;
  let registryPath: string;
  let storeDir: string;
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "adopt-"));
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

  function opts(overrides: Partial<Parameters<typeof save>[0]> = {}) {
    return {
      skillsDir,
      registryPath,
      storePath: storeDir,
      profilesDir,
      activeFile,
      ...overrides,
    };
  }

  async function createOrphanInStore(
    name: string,
    content: string,
    storedAt?: string
  ): Promise<string> {
    const tmpSkill = join(baseDir, `tmp-${name}-${Date.now()}`);
    await mkdir(tmpSkill, { recursive: true });
    await writeFile(
      join(tmpSkill, "SKILL.md"),
      `---\nname: ${name}\n---\n${content}`
    );
    const hash = await hashDirectory(tmpSkill);
    const dest = join(storeDir, hash);
    await mkdir(dest, { recursive: true });
    await writeFile(
      join(dest, "SKILL.md"),
      `---\nname: ${name}\n---\n${content}`
    );
    if (storedAt) {
      await writeFile(
        join(dest, ".bsk-meta.json"),
        JSON.stringify({ storedAt }) + "\n"
      );
    }
    await rm(tmpSkill, { recursive: true, force: true });
    return hash;
  }

  test("adopts orphans with SKILL.md into registry and profile", async () => {
    const hash = await createOrphanInStore("orphan-skill", "# Orphan v1", "2026-01-15T00:00:00.000Z");
    await save(opts({ adoptOrphans: true }));
    const reg = await readRegistry(registryPath);
    expect(reg.skills["orphan-skill"]).toBeDefined();
    expect(reg.skills["orphan-skill"].versions).toHaveLength(1);
    expect(reg.skills["orphan-skill"].versions[0].hash).toBe(hash);
    const profile = await readProfile(join(profilesDir, "default.json"));
    expect(profile.skills.some((s) => s.skillName === "orphan-skill")).toBe(true);
  });

  test("skips orphans without SKILL.md", async () => {
    const hash = "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678";
    await mkdir(join(storeDir, hash), { recursive: true });
    await writeFile(join(storeDir, hash, "random.txt"), "not a skill");
    await save(opts({ adoptOrphans: true }));
    const reg = await readRegistry(registryPath);
    expect(Object.keys(reg.skills)).toHaveLength(0);
  });

  test("orders orphans by storedAt — older gets lower version", async () => {
    const hashOld = await createOrphanInStore("my-skill", "# Old version", "2026-01-01T00:00:00.000Z");
    const hashNew = await createOrphanInStore("my-skill", "# New version", "2026-02-01T00:00:00.000Z");
    await save(opts({ adoptOrphans: true }));
    const reg = await readRegistry(registryPath);
    expect(reg.skills["my-skill"].versions).toHaveLength(2);
    const v1 = reg.skills["my-skill"].versions.find((v) => v.v === 1)!;
    const v2 = reg.skills["my-skill"].versions.find((v) => v.v === 2)!;
    expect(v1.hash).toBe(hashOld);
    expect(v2.hash).toBe(hashNew);
  });

  test("falls back to mtimeMs when no .bsk-meta.json", async () => {
    const hash1 = await createOrphanInStore("fallback-skill", "# Version A");
    await new Promise((r) => setTimeout(r, 50));
    const hash2 = await createOrphanInStore("fallback-skill", "# Version B");
    await save(opts({ adoptOrphans: true }));
    const reg = await readRegistry(registryPath);
    expect(reg.skills["fallback-skill"].versions).toHaveLength(2);
    const v1 = reg.skills["fallback-skill"].versions.find((v) => v.v === 1)!;
    expect(v1.hash).toBe(hash1);
  });

  test("active skills get higher version than orphans", async () => {
    await createOrphanInStore("shared-skill", "# Orphan version", "2026-01-01T00:00:00.000Z");
    const activeSkill = join(skillsDir, "shared-skill");
    await mkdir(activeSkill, { recursive: true });
    await writeFile(join(activeSkill, "SKILL.md"), "---\nname: shared-skill\n---\n# Active version");
    await save(opts({ adoptOrphans: true }));
    const reg = await readRegistry(registryPath);
    const versions = reg.skills["shared-skill"].versions;
    expect(versions).toHaveLength(2);
    const maxV = versions.reduce((max, v) => Math.max(max, v.v), 0);
    const activeHash = await hashDirectory(activeSkill);
    const activeVersion = versions.find((v) => v.hash === activeHash)!;
    expect(activeVersion.v).toBe(maxV);
  });

  test("duplicate hash (orphan = active) is idempotent", async () => {
    const activeSkill = join(skillsDir, "dup-skill");
    await mkdir(activeSkill, { recursive: true });
    await writeFile(join(activeSkill, "SKILL.md"), "---\nname: dup-skill\n---\n# Same content");
    const hash = await hashDirectory(activeSkill);
    const dest = join(storeDir, hash);
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, "SKILL.md"), "---\nname: dup-skill\n---\n# Same content");
    await writeFile(join(dest, ".bsk-meta.json"), JSON.stringify({ storedAt: "2026-01-01T00:00:00.000Z" }) + "\n");
    await save(opts({ adoptOrphans: true }));
    const reg = await readRegistry(registryPath);
    expect(reg.skills["dup-skill"].versions).toHaveLength(1);
  });

  test("errors when --adopt-orphans used with skill name", async () => {
    await save(opts({ adoptOrphans: true, skillName: "some-skill" }));
    const reg = await readRegistry(registryPath);
    expect(Object.keys(reg.skills)).toHaveLength(0);
  });

  test("no orphans prints message and continues to normal save", async () => {
    const skill = join(skillsDir, "known-skill");
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "---\nname: known-skill\n---\n# K");
    await save(opts());
    await save(opts({ adoptOrphans: true }));
    const reg = await readRegistry(registryPath);
    expect(reg.skills["known-skill"].versions).toHaveLength(1);
  });
});
