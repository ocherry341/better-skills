import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { readRegistry } from "../src/core/registry.js";
import { readProfile } from "../src/core/profile.js";
import { hashDirectory } from "../src/core/hasher.js";
import { storeAdopt } from "../src/commands/store-cmd.js";

describe("storeAdopt", () => {
  let baseDir: string;
  let registryPath: string;
  let storeDir: string;
  let profilesDir: string;
  let activeFile: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "store-adopt-"));
    registryPath = join(baseDir, "registry.json");
    storeDir = join(baseDir, "store");
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    await mkdir(storeDir, { recursive: true });
    await mkdir(profilesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  function opts(overrides: Partial<Parameters<typeof storeAdopt>[0]> = {}) {
    return {
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
    const hash = await createOrphanInStore(
      "orphan-skill",
      "# Orphan v1",
      "2026-01-15T00:00:00.000Z"
    );
    const result = await storeAdopt(opts());
    expect(result.adopted).toBe(1);

    const reg = await readRegistry(registryPath);
    expect(reg.skills["orphan-skill"]).toBeDefined();
    expect(reg.skills["orphan-skill"].versions).toHaveLength(1);
    expect(reg.skills["orphan-skill"].versions[0].hash).toBe(hash);

    const profile = await readProfile(join(profilesDir, "default.json"));
    expect(profile.skills.some((s) => s.skillName === "orphan-skill")).toBe(
      true
    );
  });

  test("skips orphans without SKILL.md", async () => {
    const hash =
      "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678";
    await mkdir(join(storeDir, hash), { recursive: true });
    await writeFile(join(storeDir, hash, "random.txt"), "not a skill");
    const result = await storeAdopt(opts());
    expect(result.adopted).toBe(0);

    const reg = await readRegistry(registryPath);
    expect(Object.keys(reg.skills)).toHaveLength(0);
  });

  test("orders orphans by storedAt — older gets lower version", async () => {
    const hashOld = await createOrphanInStore(
      "my-skill",
      "# Old version",
      "2026-01-01T00:00:00.000Z"
    );
    const hashNew = await createOrphanInStore(
      "my-skill",
      "# New version",
      "2026-02-01T00:00:00.000Z"
    );
    const result = await storeAdopt(opts());
    expect(result.adopted).toBe(2);

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
    const result = await storeAdopt(opts());
    expect(result.adopted).toBe(2);

    const reg = await readRegistry(registryPath);
    expect(reg.skills["fallback-skill"].versions).toHaveLength(2);
    const v1 = reg.skills["fallback-skill"].versions.find(
      (v) => v.v === 1
    )!;
    expect(v1.hash).toBe(hash1);
  });

  test("returns zero when no orphans exist", async () => {
    const result = await storeAdopt(opts());
    expect(result.adopted).toBe(0);
  });

  test("duplicate hash (orphan = active) is idempotent", async () => {
    // First, register a skill with a known hash
    const hash = await createOrphanInStore(
      "dup-skill",
      "# Same content",
      "2026-01-01T00:00:00.000Z"
    );

    // Adopt it once
    await storeAdopt(opts());
    const reg1 = await readRegistry(registryPath);
    expect(reg1.skills["dup-skill"].versions).toHaveLength(1);

    // Run adopt again — the hash is now referenced, so it shouldn't be an orphan
    const result = await storeAdopt(opts());
    expect(result.adopted).toBe(0);

    const reg2 = await readRegistry(registryPath);
    expect(reg2.skills["dup-skill"].versions).toHaveLength(1);
  });
});
