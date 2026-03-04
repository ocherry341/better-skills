# Profile Skill Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `profile add <source>` and `profile rm <skill-name>` commands so users can manage skills within a specific profile without switching profiles first.

**Architecture:** New `profileAdd()` and `profileRm()` functions in `commands/profile.ts` that reuse existing core modules (resolver, fetcher, hasher, store, linker). Conditional linking: only link/unlink to `~/.agents/skills/` when the target profile is the active profile.

**Tech Stack:** TypeScript, Commander.js, Bun test runner, existing core modules (resolver, fetcher, hasher, store, linker, profile)

---

### Task 1: Implement `profileAdd()` function

**Files:**
- Modify: `packages/cli/src/commands/profile.ts`

**Step 1: Add imports to profile.ts**

Add these imports at the top of `packages/cli/src/commands/profile.ts` (merge with existing imports):

```typescript
import { resolve as resolveSource, toSourceString, type SourceDescriptor } from "../core/resolver.js";
import { fetch } from "../core/fetcher.js";
import * as store from "../core/store.js";
import { readSkillMd } from "../utils/skill-md.js";
import { basename } from "path";
```

Note: `linkSkill`, `unlinkSkill`, `readProfile`, `writeProfile`, `getActiveProfileName`, `hashDirectory`, `stat`, `join`, `mkdir` are already imported.

**Step 2: Add the interface and function**

Add after the `profileUse` function (at the end of the file):

```typescript
export interface ProfileAddInternalOptions {
  profilesDir: string;
  activeFile: string;
  skillsDir: string;
  storePath: string;
  profileName?: string;
  copy?: boolean;
  name?: string;
}

/**
 * Add a skill to a specific profile.
 * If the target profile is active, also links to the global skills directory.
 */
export async function profileAdd(
  source: string,
  opts: ProfileAddInternalOptions
): Promise<void> {
  // 1. Resolve target profile
  const activeName = await getActiveProfileName(opts.activeFile);
  const targetName = opts.profileName ?? activeName;
  if (!targetName) {
    throw new Error("No active profile. Specify --profile <name> or create a profile first.");
  }

  const filePath = join(opts.profilesDir, `${targetName}.json`);
  const profile = await readProfile(filePath);

  // 2. Resolve → Fetch → Hash → Store
  console.log(`Resolving ${source}...`);
  const descriptor = resolveSource(source);

  console.log(`Fetching from ${descriptor.type} source...`);
  const result = await fetch(descriptor);

  try {
    // 3. Determine skill name
    let skillName: string;
    if (opts.name) {
      skillName = opts.name;
    } else {
      try {
        const meta = await readSkillMd(result.dir);
        skillName = meta.name;
      } catch {
        skillName = deriveNameFromSource(descriptor);
      }
    }

    // 4. Hash
    console.log(`Hashing ${skillName}...`);
    const hash = await hashDirectory(result.dir);

    // 5. Store
    console.log(`Storing ${hash.slice(0, 8)}...`);
    await store.store(hash, result.dir);

    // 6. Record in profile
    profile.skills = profile.skills.filter((s) => s.skillName !== skillName);
    profile.skills.push({
      skillName,
      hash,
      source: toSourceString(descriptor),
      addedAt: new Date().toISOString(),
    });
    await writeProfile(filePath, profile);

    // 7. Link if target is the active profile
    const isActive = targetName === activeName;
    if (isActive) {
      const targetDir = join(opts.skillsDir, skillName);
      console.log(`Linking to ${targetDir}...`);
      const storeDir = store.getHashPath(hash);
      await linkSkill(storeDir, targetDir, { copy: opts.copy });
    }

    console.log(`✓ Added ${skillName} (${hash.slice(0, 8)}) to profile '${targetName}'`);
    if (!isActive) {
      console.log(`  (not linked — '${targetName}' is not the active profile)`);
    }
  } finally {
    await result.cleanup();
  }
}

function deriveNameFromSource(desc: SourceDescriptor): string {
  switch (desc.type) {
    case "github":
      if (desc.subdir) {
        return basename(desc.subdir);
      }
      return desc.repo;
    case "git": {
      const match = desc.url.match(/\/([^/]+?)(?:\.git)?$/);
      return match?.[1] ?? "unnamed-skill";
    }
    case "local":
      return basename(desc.path);
  }
}
```

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add packages/cli/src/commands/profile.ts
git commit -m "feat: add profileAdd() function for adding skills to specific profiles"
```

---

### Task 2: Implement `profileRm()` function

**Files:**
- Modify: `packages/cli/src/commands/profile.ts`

**Step 1: Add the interface and function**

Add after `profileAdd` (at the end of the file, before `deriveNameFromSource`):

```typescript
export interface ProfileRmInternalOptions {
  profilesDir: string;
  activeFile: string;
  skillsDir: string;
  profileName?: string;
}

/**
 * Remove a skill from a specific profile.
 * If the target profile is active, also unlinks from the global skills directory.
 */
export async function profileRm(
  skillName: string,
  opts: ProfileRmInternalOptions
): Promise<void> {
  // 1. Resolve target profile
  const activeName = await getActiveProfileName(opts.activeFile);
  const targetName = opts.profileName ?? activeName;
  if (!targetName) {
    throw new Error("No active profile. Specify --profile <name> or create a profile first.");
  }

  const filePath = join(opts.profilesDir, `${targetName}.json`);
  const profile = await readProfile(filePath);

  // 2. Check skill exists in profile
  const exists = profile.skills.some((s) => s.skillName === skillName);
  if (!exists) {
    throw new Error(`Skill '${skillName}' not found in profile '${targetName}'.`);
  }

  // 3. Remove from profile
  profile.skills = profile.skills.filter((s) => s.skillName !== skillName);
  await writeProfile(filePath, profile);

  // 4. Unlink if target is the active profile
  const isActive = targetName === activeName;
  if (isActive) {
    const targetDir = join(opts.skillsDir, skillName);
    try {
      await stat(targetDir);
      console.log(`Removing ${targetDir}...`);
      await unlinkSkill(targetDir);
    } catch {
      // Skill dir doesn't exist on disk — already removed, just update profile
    }
  }

  console.log(`✓ Removed ${skillName} from profile '${targetName}'`);
  if (!isActive) {
    console.log(`  (no unlink needed — '${targetName}' is not the active profile)`);
  }
}
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/cli/src/commands/profile.ts
git commit -m "feat: add profileRm() function for removing skills from specific profiles"
```

---

### Task 3: Register CLI subcommands

**Files:**
- Modify: `packages/cli/src/cli.ts`

**Step 1: Update imports**

In `packages/cli/src/cli.ts`, add `profileAdd` and `profileRm` to the import from `./commands/profile.js`:

```typescript
import {
  profileCreate,
  profileLs,
  profileShow,
  profileUse,
  profileAdd,
  profileRm,
} from "./commands/profile.js";
```

**Step 2: Register `profile add` subcommand**

Add after the `profile use` command block (before `program.parse()`):

```typescript
profile
  .command("add <source>")
  .description("Add a skill to a profile")
  .option("-p, --profile <name>", "Target profile (defaults to active)")
  .option("--copy", "Use file copy instead of hard links")
  .option("-n, --name <name>", "Override the skill name")
  .action(async (source: string, opts) => {
    await profileAdd(source, {
      profilesDir: getProfilesPath(),
      activeFile: getActiveProfileFilePath(),
      skillsDir: getGlobalSkillsPath(),
      storePath: getStorePath(),
      profileName: opts.profile,
      copy: opts.copy,
      name: opts.name,
    });
  });
```

**Step 3: Register `profile rm` subcommand**

Add after the `profile add` block:

```typescript
profile
  .command("rm <skill-name>")
  .alias("remove")
  .description("Remove a skill from a profile")
  .option("-p, --profile <name>", "Target profile (defaults to active)")
  .action(async (skillName: string, opts) => {
    await profileRm(skillName, {
      profilesDir: getProfilesPath(),
      activeFile: getActiveProfileFilePath(),
      skillsDir: getGlobalSkillsPath(),
      profileName: opts.profile,
    });
  });
```

**Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/cli.ts
git commit -m "feat: register profile add and profile rm CLI subcommands"
```

---

### Task 4: Write tests for `profileAdd()`

**Files:**
- Modify: `packages/cli/tests/profile-commands.test.ts`

**Step 1: Write tests**

Add the following `describe` block at the end of `packages/cli/tests/profile-commands.test.ts`. These tests use a local directory as the source (to avoid network calls), following the same temp dir pattern used by existing tests.

Add these imports at the top (merge with existing):

```typescript
import { profileAdd, profileRm } from "../src/commands/profile.js";
import * as storeModule from "../src/core/store.js";
```

Then add the test block:

```typescript
describe("profile add", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;
  let skillsDir: string;
  let storePath: string;
  let localSkillDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "profile-add-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    skillsDir = join(baseDir, "skills");
    storePath = join(baseDir, "store");
    localSkillDir = join(baseDir, "local-skill");
    await mkdir(profilesDir, { recursive: true });
    await mkdir(skillsDir, { recursive: true });
    await mkdir(storePath, { recursive: true });

    // Create a local skill source
    await mkdir(localSkillDir, { recursive: true });
    await writeFile(
      join(localSkillDir, "SKILL.md"),
      "---\nname: test-skill\n---\n# Test Skill"
    );
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("adds skill to active profile and links", async () => {
    // Create and activate profile
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await profileAdd(localSkillDir, {
      profilesDir,
      activeFile,
      skillsDir,
      storePath,
    });

    // Profile should have the skill
    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("test-skill");

    // Skill should be linked
    const entries = await readdir(skillsDir);
    expect(entries).toContain("test-skill");
  });

  test("adds skill to non-active profile without linking", async () => {
    // Create two profiles, activate "dev"
    const devProfile: Profile = { name: "dev", skills: [] };
    const workProfile: Profile = { name: "work", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), devProfile);
    await writeProfile(join(profilesDir, "work.json"), workProfile);
    await setActiveProfileName(activeFile, "dev");

    await profileAdd(localSkillDir, {
      profilesDir,
      activeFile,
      skillsDir,
      storePath,
      profileName: "work",
    });

    // Work profile should have the skill
    const updated = await readProfile(join(profilesDir, "work.json"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("test-skill");

    // Skill should NOT be linked (work is not active)
    const entries = await readdir(skillsDir);
    expect(entries).not.toContain("test-skill");
  });

  test("replaces existing skill in profile", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "test-skill", hash: "old-hash", source: "old", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await profileAdd(localSkillDir, {
      profilesDir,
      activeFile,
      skillsDir,
      storePath,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].hash).not.toBe("old-hash");
  });

  test("throws when no profile specified and no active profile", async () => {
    expect(
      profileAdd(localSkillDir, {
        profilesDir,
        activeFile,
        skillsDir,
        storePath,
      })
    ).rejects.toThrow(/No active profile/);
  });

  test("throws when target profile does not exist", async () => {
    expect(
      profileAdd(localSkillDir, {
        profilesDir,
        activeFile,
        skillsDir,
        storePath,
        profileName: "nonexistent",
      })
    ).rejects.toThrow();
  });

  test("respects --name override", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    await profileAdd(localSkillDir, {
      profilesDir,
      activeFile,
      skillsDir,
      storePath,
      name: "custom-name",
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills[0].skillName).toBe("custom-name");
  });
});
```

**Step 2: Run the tests**

Run: `bun test packages/cli/tests/profile-commands.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add packages/cli/tests/profile-commands.test.ts
git commit -m "test: add tests for profileAdd()"
```

---

### Task 5: Write tests for `profileRm()`

**Files:**
- Modify: `packages/cli/tests/profile-commands.test.ts`

**Step 1: Write tests**

Add after the `profile add` describe block:

```typescript
describe("profile rm", () => {
  let baseDir: string;
  let profilesDir: string;
  let activeFile: string;
  let skillsDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "profile-rm-"));
    profilesDir = join(baseDir, "profiles");
    activeFile = join(baseDir, "active-profile");
    skillsDir = join(baseDir, "skills");
    await mkdir(profilesDir, { recursive: true });
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  test("removes skill from active profile and unlinks", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "brainstorming", hash: "abc", source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
        { skillName: "debugging", hash: "def", source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    // Create linked skill on disk
    const skillDir = join(skillsDir, "brainstorming");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "# Brainstorming");

    await profileRm("brainstorming", {
      profilesDir,
      activeFile,
      skillsDir,
    });

    // Profile should have only debugging
    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(1);
    expect(updated.skills[0].skillName).toBe("debugging");

    // Skill should be unlinked
    const entries = await readdir(skillsDir);
    expect(entries).not.toContain("brainstorming");
  });

  test("removes skill from non-active profile without unlinking", async () => {
    const devProfile: Profile = { name: "dev", skills: [] };
    const workProfile: Profile = {
      name: "work",
      skills: [
        { skillName: "brainstorming", hash: "abc", source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), devProfile);
    await writeProfile(join(profilesDir, "work.json"), workProfile);
    await setActiveProfileName(activeFile, "dev");

    await profileRm("brainstorming", {
      profilesDir,
      activeFile,
      skillsDir,
      profileName: "work",
    });

    // Work profile should be empty
    const updated = await readProfile(join(profilesDir, "work.json"));
    expect(updated.skills.length).toBe(0);
  });

  test("throws when skill not in profile", async () => {
    const profile: Profile = { name: "dev", skills: [] };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    expect(
      profileRm("nonexistent", {
        profilesDir,
        activeFile,
        skillsDir,
      })
    ).rejects.toThrow(/not found in profile/);
  });

  test("throws when no profile specified and no active profile", async () => {
    expect(
      profileRm("brainstorming", {
        profilesDir,
        activeFile,
        skillsDir,
      })
    ).rejects.toThrow(/No active profile/);
  });

  test("throws when target profile does not exist", async () => {
    expect(
      profileRm("brainstorming", {
        profilesDir,
        activeFile,
        skillsDir,
        profileName: "nonexistent",
      })
    ).rejects.toThrow();
  });

  test("handles skill missing on disk gracefully when active", async () => {
    const profile: Profile = {
      name: "dev",
      skills: [
        { skillName: "ghost", hash: "abc", source: "x/y", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    await writeProfile(join(profilesDir, "dev.json"), profile);
    await setActiveProfileName(activeFile, "dev");

    // Skill not on disk — should not throw
    await profileRm("ghost", {
      profilesDir,
      activeFile,
      skillsDir,
    });

    const updated = await readProfile(join(profilesDir, "dev.json"));
    expect(updated.skills.length).toBe(0);
  });
});
```

**Step 2: Run all tests**

Run: `bun test packages/cli/tests/profile-commands.test.ts`
Expected: ALL PASS

**Step 3: Run full test suite**

Run: `bun run test`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add packages/cli/tests/profile-commands.test.ts
git commit -m "test: add tests for profileRm()"
```

---

### Task 6: Final verification

**Step 1: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 2: Run full test suite**

Run: `bun run test`
Expected: ALL PASS

**Step 3: Build**

Run: `bun run build`
Expected: PASS

**Step 4: Smoke test CLI help**

Run: `bun run dev -- profile --help`
Expected: Shows `add`, `rm`, `create`, `ls`, `show`, `use` subcommands

Run: `bun run dev -- profile add --help`
Expected: Shows `--profile`, `--copy`, `--name` options

Run: `bun run dev -- profile rm --help`
Expected: Shows `--profile` option
