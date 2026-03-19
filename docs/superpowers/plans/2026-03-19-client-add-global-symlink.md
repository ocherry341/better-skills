# Implementation Plan: bsk client add Global Symlink Refactor

**Spec:** docs/superpowers/specs/2026-03-19-client-add-global-symlink.md
**Branch:** feature/client-add-global-symlink
**Worktree:** .worktrees/client-add-global-symlink

> **For agentic workers:** This plan is executed by an agent team via superpowers:use-agent-team. The TeamLeader dispatches one implementer teammate per task with a dedicated reviewer teammate. Do NOT use subagent-driven-development or executing-plans.

**Goal:** Replace copy-based client skill syncing with a single symlink from each client's skills directory to `~/.agents/skills/`, eliminating all per-command sync logic.

**Architecture:** `clientAdd` creates a symlink from the client's globalDir (e.g. `~/.claude/skills/`) to the canonical `~/.agents/skills/`. All commands that previously copied skills into client dirs (`add`, `save`, `mv`, `rm`, `profile use/add/rm`) have their sync blocks removed. `clientRm` removes the symlink. The `linkToClients`, `unlinkFromClients`, and `resolveClientDirs` functions are deleted.

**Tech Stack:** TypeScript (strict, ESM-only), Bun runtime + test runner, commander.js CLI

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `src/commands/client.ts` | Major rewrite | `clientAdd` (symlink flow), `clientRm` (symlink removal) |
| `src/cli.ts` | Modify | Singular CLI args, remove `--clients`/`--no-clients` |
| `src/commands/add.ts` | Remove sync block | Remove `linkToClients` call + client options |
| `src/commands/save.ts` | Remove sync block | Remove dynamic import + sync loop |
| `src/commands/mv.ts` | Remove sync block | Remove `linkToClients` call + `noClients` option |
| `src/commands/rm.ts` | Remove sync block | Remove `unlinkFromClients` call |
| `src/commands/profile.ts` | Remove sync blocks | Remove all 4 `linkToClients`/`unlinkFromClients` calls |
| `src/core/linker.ts` | Remove functions | Delete `linkToClients`, `unlinkFromClients` |
| `src/core/clients.ts` | Remove function | Delete `resolveClientDirs` |
| `tests/client-commands.test.ts` | Major rewrite | New symlink-based tests |
| `tests/linker-clients.test.ts` | Delete | All tests for deleted functions |
| `tests/clients.test.ts` | Remove section | Delete `resolveClientDirs` tests |
| `tests/save.test.ts` | Minor fix | Remove mock of `resolveClientDirs` |
| `tests/mv.test.ts` | Minor fix | Remove `noClients` from opts |
| `tests/tui/paste.test.tsx` | Minor fix | Remove `resolveClientDirs` mock line |

---

### Task 1: Rewrite `clientAdd` Tests for Symlink Flow

**Files:**
- Modify: `packages/cli/tests/client-commands.test.ts:29-231`

This task rewrites the `clientAdd` test suite. Existing tests that call `clientAdd(["claude"], ...)` change to `clientAdd("claude", ...)`. The "adds multiple clients" and "syncs existing skills" tests are removed. New tests cover the symlink flow from the spec.

- [ ] **Step 1: Update test imports and add `readdir` + `rename` to imports**

In `packages/cli/tests/client-commands.test.ts`, the imports at line 2 already include `lstat`, `readlink`, `symlink` — no changes needed to imports.

- [ ] **Step 2: Rewrite the `clientAdd` describe block**

Replace the entire `describe("clientAdd", ...)` block (lines 29–231) with the new tests below. The `beforeEach` already creates `baseDir`, `configPath`, `registryPath`, `storeDir`, and `skillsDir`.

```ts
  describe("clientAdd", () => {
    test("fresh add creates symlink to agents dir", async () => {
      const clientDir = join(baseDir, "claude-skills");

      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
      });

      const config = await readConfig(configPath);
      expect(config.clients).toContain("claude");

      const linkStat = await lstat(clientDir);
      expect(linkStat.isSymbolicLink()).toBe(true);

      const target = await readlink(clientDir);
      expect(target).toBe(skillsDir);
    });

    test("already correct symlink prints already enabled", async () => {
      const clientDir = join(baseDir, "claude-skills");
      const { symlink: symlinkFn } = await import("fs/promises");
      await symlinkFn(skillsDir, clientDir);

      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
      });

      // Still a symlink pointing to correct target
      const linkStat = await lstat(clientDir);
      expect(linkStat.isSymbolicLink()).toBe(true);
      const target = await readlink(clientDir);
      expect(target).toBe(skillsDir);

      // Config should still have client
      const config = await readConfig(configPath);
      expect(config.clients).toContain("claude");
    });

    test("symlink to wrong target throws error", async () => {
      const clientDir = join(baseDir, "claude-skills");
      const wrongTarget = join(baseDir, "wrong-dir");
      await mkdir(wrongTarget, { recursive: true });
      const { symlink: symlinkFn } = await import("fs/promises");
      await symlinkFn(wrongTarget, clientDir);

      await expect(
        clientAdd("claude", {
          configPath,
          registryPath,
          storePath: storeDir,
          skillsDir,
          clientDirOverrides: { claude: clientDir },
          globalSkillsDir: skillsDir,
        })
      ).rejects.toThrow("symlink");
    });

    test("empty existing dir is replaced with symlink", async () => {
      const clientDir = join(baseDir, "claude-skills");
      await mkdir(clientDir, { recursive: true });

      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
      });

      const linkStat = await lstat(clientDir);
      expect(linkStat.isSymbolicLink()).toBe(true);
      const target = await readlink(clientDir);
      expect(target).toBe(skillsDir);
    });

    test("existing dir with skills migrates to agents dir and creates symlink", async () => {
      const clientDir = join(baseDir, "claude-skills");
      const skillDir = join(clientDir, "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "# My Skill");

      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
      });

      // Skill should now be in agents dir
      const movedContent = await readFile(join(skillsDir, "my-skill", "SKILL.md"), "utf-8");
      expect(movedContent).toBe("# My Skill");

      // Client dir should be a symlink
      const linkStat = await lstat(clientDir);
      expect(linkStat.isSymbolicLink()).toBe(true);
    });

    test("existing dir with conflicting skills throws error", async () => {
      const clientDir = join(baseDir, "claude-skills");

      // Same skill name in both dirs
      await mkdir(join(clientDir, "my-skill"), { recursive: true });
      await writeFile(join(clientDir, "my-skill", "SKILL.md"), "# Client Version");

      await mkdir(join(skillsDir, "my-skill"), { recursive: true });
      await writeFile(join(skillsDir, "my-skill", "SKILL.md"), "# Agents Version");

      await expect(
        clientAdd("claude", {
          configPath,
          registryPath,
          storePath: storeDir,
          skillsDir,
          clientDirOverrides: { claude: clientDir },
          globalSkillsDir: skillsDir,
        })
      ).rejects.toThrow("conflict");

      // Client dir should still be a real directory (unchanged)
      const linkStat = await lstat(clientDir);
      expect(linkStat.isDirectory()).toBe(true);
      expect(linkStat.isSymbolicLink()).toBe(false);
    });

    test("rejects unknown client ID", async () => {
      await expect(
        clientAdd("bogus", {
          configPath,
          registryPath,
          storePath: storeDir,
          skillsDir,
        })
      ).rejects.toThrow("Unknown client");
    });

    test("rejects agents as client", async () => {
      await expect(
        clientAdd("agents", {
          configPath,
          registryPath,
          storePath: storeDir,
          skillsDir,
        })
      ).rejects.toThrow("always enabled");
    });

    test("creates project-level symlink for client with projectSubdir", async () => {
      const projectDir = join(baseDir, "my-project");
      const agentsSkills = join(projectDir, ".agents", "skills");
      await mkdir(agentsSkills, { recursive: true });

      const clientDir = join(baseDir, "claude-skills");

      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
        projectRoot: projectDir,
      });

      const symlinkPath = join(projectDir, ".claude", "skills");
      const linkStat = await lstat(symlinkPath);
      expect(linkStat.isSymbolicLink()).toBe(true);

      const target = await readlink(symlinkPath);
      expect(target).toBe(join("..", ".agents", "skills"));
    });

    test("creates .agents/skills if it does not exist", async () => {
      const projectDir = join(baseDir, "my-project");
      await mkdir(projectDir, { recursive: true });

      const clientDir = join(baseDir, "claude-skills");

      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
        projectRoot: projectDir,
      });

      const agentsSkills = join(projectDir, ".agents", "skills");
      const s = await stat(agentsSkills);
      expect(s.isDirectory()).toBe(true);
    });

    test("skips symlink if target already exists as real directory", async () => {
      const projectDir = join(baseDir, "my-project");
      const claudeSkills = join(projectDir, ".claude", "skills");
      await mkdir(claudeSkills, { recursive: true });
      await writeFile(join(claudeSkills, "existing.md"), "keep me");

      const clientDir = join(baseDir, "claude-skills");

      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
        projectRoot: projectDir,
      });

      // Should still be a real directory, not a symlink
      const linkStat = await lstat(claudeSkills);
      expect(linkStat.isSymbolicLink()).toBe(false);
      expect(linkStat.isDirectory()).toBe(true);
    });

    test("is idempotent when symlink already correct", async () => {
      const projectDir = join(baseDir, "my-project");
      const agentsSkills = join(projectDir, ".agents", "skills");
      await mkdir(agentsSkills, { recursive: true });

      const clientDir = join(baseDir, "claude-skills");

      // Run twice
      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
        projectRoot: projectDir,
      });
      await clientAdd("claude", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        globalSkillsDir: skillsDir,
        projectRoot: projectDir,
      });

      const symlinkPath = join(projectDir, ".claude", "skills");
      const linkStat = await lstat(symlinkPath);
      expect(linkStat.isSymbolicLink()).toBe(true);
    });

    test("skips project symlink for client with null projectSubdir", async () => {
      const projectDir = join(baseDir, "my-project");
      await mkdir(projectDir, { recursive: true });

      const clientDir = join(baseDir, "amp-skills");

      await clientAdd("amp", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { amp: clientDir },
        globalSkillsDir: skillsDir,
        projectRoot: projectDir,
      });

      // .amp/skills should NOT exist
      const ampSkills = join(projectDir, ".amp", "skills");
      await expect(stat(ampSkills)).rejects.toThrow();
    });

    test("handles copilot special path .github/skills", async () => {
      const projectDir = join(baseDir, "my-project");
      const agentsSkills = join(projectDir, ".agents", "skills");
      await mkdir(agentsSkills, { recursive: true });

      const clientDir = join(baseDir, "copilot-skills");

      await clientAdd("copilot", {
        configPath,
        registryPath,
        storePath: storeDir,
        skillsDir,
        clientDirOverrides: { copilot: clientDir },
        globalSkillsDir: skillsDir,
        projectRoot: projectDir,
      });

      const symlinkPath = join(projectDir, ".github", "skills");
      const linkStat = await lstat(symlinkPath);
      expect(linkStat.isSymbolicLink()).toBe(true);

      const target = await readlink(symlinkPath);
      expect(target).toBe(join("..", ".agents", "skills"));
    });
  });
```

- [ ] **Step 3: Add `readFile` and `readdir` to imports if not present**

At line 2, ensure `readFile` and `readdir` are in the import list:

```ts
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir, stat, lstat, readlink } from "fs/promises";
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `bun test packages/cli/tests/client-commands.test.ts`
Expected: FAIL — `clientAdd` still expects `string[]`, not `string`. The new tests call `clientAdd("claude", ...)` which will fail with type/runtime errors.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/tests/client-commands.test.ts
git commit -m "test: rewrite clientAdd tests for symlink flow"
```

---

### Task 2: Rewrite `clientRm` Tests for Symlink Flow

**Files:**
- Modify: `packages/cli/tests/client-commands.test.ts:233-341`

- [ ] **Step 1: Rewrite the `clientRm` describe block**

Replace the `describe("clientRm", ...)` block (lines 233–341) with new tests:

```ts
  describe("clientRm", () => {
    test("removes client from config", async () => {
      await writeFile(configPath, JSON.stringify({ clients: ["claude", "cursor"] }));

      const clientDir = join(baseDir, "claude-skills");
      const { symlink: symlinkFn } = await import("fs/promises");
      await symlinkFn(skillsDir, clientDir);

      await clientRm("claude", {
        configPath,
        registryPath,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
      });

      const config = await readConfig(configPath);
      expect(config.clients).not.toContain("claude");
      expect(config.clients).toContain("cursor");
    });

    test("removes symlink on clientRm", async () => {
      await writeFile(configPath, JSON.stringify({ clients: ["claude"] }));

      const clientDir = join(baseDir, "claude-skills");
      const { symlink: symlinkFn } = await import("fs/promises");
      await symlinkFn(skillsDir, clientDir);

      await clientRm("claude", {
        configPath,
        registryPath,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
      });

      // Symlink should be gone
      await expect(lstat(clientDir)).rejects.toThrow();
      // But agents dir should still exist
      const s = await stat(skillsDir);
      expect(s.isDirectory()).toBe(true);
    });

    test("errors when globalDir is a real directory", async () => {
      await writeFile(configPath, JSON.stringify({ clients: ["claude"] }));

      // Create a real directory (legacy state, not a symlink)
      const clientDir = join(baseDir, "claude-skills");
      await mkdir(join(clientDir, "my-skill"), { recursive: true });
      await writeFile(join(clientDir, "my-skill", "SKILL.md"), "test");

      await expect(
        clientRm("claude", {
          configPath,
          registryPath,
          skillsDir,
          clientDirOverrides: { claude: clientDir },
        })
      ).rejects.toThrow("real directory");

      // Directory should be untouched
      const s = await stat(join(clientDir, "my-skill", "SKILL.md"));
      expect(s.isFile()).toBe(true);
    });

    test("rejects agents removal", async () => {
      await expect(
        clientRm("agents", {
          configPath,
          registryPath,
          skillsDir,
        })
      ).rejects.toThrow("always enabled");
    });

    test("removes project-level symlink", async () => {
      const projectDir = join(baseDir, "my-project");
      const agentsSkills = join(projectDir, ".agents", "skills");
      await mkdir(agentsSkills, { recursive: true });

      // Create the symlink manually
      const claudeDir = join(projectDir, ".claude");
      await mkdir(claudeDir, { recursive: true });
      const symlinkPath = join(claudeDir, "skills");
      const { symlink: symlinkFn } = await import("fs/promises");
      await symlinkFn(join("..", ".agents", "skills"), symlinkPath);

      await writeFile(configPath, JSON.stringify({ clients: ["claude"] }));

      const clientDir = join(baseDir, "claude-skills");
      await symlinkFn(skillsDir, clientDir);

      await clientRm("claude", {
        configPath,
        registryPath,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        projectRoot: projectDir,
      });

      await expect(lstat(symlinkPath)).rejects.toThrow();
    });

    test("does not remove real directory on clientRm project-level", async () => {
      const projectDir = join(baseDir, "my-project");
      const claudeSkills = join(projectDir, ".claude", "skills");
      await mkdir(claudeSkills, { recursive: true });
      await writeFile(join(claudeSkills, "keep.md"), "important");

      await writeFile(configPath, JSON.stringify({ clients: ["claude"] }));

      const clientDir = join(baseDir, "claude-skills");
      const { symlink: symlinkFn } = await import("fs/promises");
      await symlinkFn(skillsDir, clientDir);

      await clientRm("claude", {
        configPath,
        registryPath,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
        projectRoot: projectDir,
      });

      // Real directory should still exist
      const s = await stat(claudeSkills);
      expect(s.isDirectory()).toBe(true);
    });

    test("no-op when globalDir does not exist", async () => {
      await writeFile(configPath, JSON.stringify({ clients: ["claude"] }));

      const clientDir = join(baseDir, "nonexistent-claude-skills");

      // Should not throw
      await clientRm("claude", {
        configPath,
        registryPath,
        skillsDir,
        clientDirOverrides: { claude: clientDir },
      });

      const config = await readConfig(configPath);
      expect(config.clients).not.toContain("claude");
    });

    test("skips project removal for client with null projectSubdir", async () => {
      const projectDir = join(baseDir, "my-project");
      await mkdir(projectDir, { recursive: true });

      await writeFile(configPath, JSON.stringify({ clients: ["amp"] }));

      const clientDir = join(baseDir, "amp-skills");
      const { symlink: symlinkFn } = await import("fs/promises");
      await symlinkFn(skillsDir, clientDir);

      // Should not throw
      await clientRm("amp", {
        configPath,
        registryPath,
        skillsDir,
        clientDirOverrides: { amp: clientDir },
        projectRoot: projectDir,
      });
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/cli/tests/client-commands.test.ts`
Expected: FAIL — `clientRm` still expects `string[]`.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/tests/client-commands.test.ts
git commit -m "test: rewrite clientRm tests for symlink flow"
```

---

### Task 3: Implement `clientAdd` Symlink Flow

**Files:**
- Modify: `packages/cli/src/commands/client.ts:1-105`

- [ ] **Step 1: Rewrite `ClientAddOptions` interface and `clientAdd` function**

Replace the entire top section of `packages/cli/src/commands/client.ts` (lines 1–105) with the new implementation:

```ts
import { lstat, mkdir, readdir, readlink, rename, rm, stat, symlink } from "fs/promises";
import { dirname, join } from "path";
import {
  CLIENT_REGISTRY,
  VALID_CLIENT_IDS,
  readConfig,
  writeConfig,
  getClientSkillsDir,
  getClientProjectSubdir,
} from "../core/clients.js";
import { save } from "./save.js";

export interface ClientAddOptions {
  configPath: string;
  registryPath: string;
  storePath: string;
  skillsDir: string;
  /** Override client->dir mapping for testing */
  clientDirOverrides?: Record<string, string>;
  /** Project root for creating project-level symlinks */
  projectRoot?: string;
  /** Override for the global skills path (testing) */
  globalSkillsDir?: string;
}

/**
 * Enable a client by symlinking its skills directory to ~/.agents/skills/.
 * Migrates existing skills if the client dir already has content.
 */
export async function clientAdd(
  clientId: string,
  opts: ClientAddOptions
): Promise<void> {
  // 1. Validate
  if (clientId === "agents") {
    throw new Error("'agents' is always enabled and cannot be added.");
  }
  if (!(clientId in CLIENT_REGISTRY)) {
    throw new Error(`Unknown client '${clientId}'. Valid clients: ${VALID_CLIENT_IDS.join(", ")}`);
  }

  // 2. Resolve directories
  const globalDir = opts.clientDirOverrides?.[clientId] ?? getClientSkillsDir(clientId);
  const agentsDir = opts.globalSkillsDir ?? opts.skillsDir;

  // Ensure agentsDir exists
  await mkdir(agentsDir, { recursive: true });

  // 3. Check globalDir state
  try {
    const st = await lstat(globalDir);

    if (st.isSymbolicLink()) {
      const target = await readlink(globalDir);
      if (target === agentsDir) {
        // Already correct symlink
        console.log(`${clientId} is already enabled (symlink exists).`);
      } else {
        throw new Error(
          `${globalDir} is a symlink to ${target}, not ${agentsDir}. Remove it manually first.`
        );
      }
    } else if (st.isDirectory()) {
      // Check if empty
      const entries = await readdir(globalDir);
      const subdirs = [];
      for (const name of entries) {
        try {
          const s = await stat(join(globalDir, name));
          if (s.isDirectory()) subdirs.push(name);
        } catch {
          // skip non-stat-able entries
        }
      }

      if (subdirs.length === 0 && entries.length === 0) {
        // Empty directory — remove and create symlink
        await rm(globalDir, { recursive: true, force: true });
        await createSymlink(agentsDir, globalDir);
      } else {
        // Has content — check for conflicts and migrate
        const agentsEntries = await safeReaddir(agentsDir);
        const conflicts = subdirs.filter((name) => agentsEntries.includes(name));

        if (conflicts.length > 0) {
          throw new Error(
            `Cannot migrate: skills [${conflicts.join(", ")}] exist in both ${globalDir} and ${agentsDir}. Resolve conflicts manually.`
          );
        }

        // Move each subdir to agentsDir
        for (const name of subdirs) {
          try {
            await rename(join(globalDir, name), join(agentsDir, name));
          } catch (err: any) {
            if (err.code === "EXDEV") {
              // Cross-device: copy + remove
              const { cpRecursive } = await import("../core/linker.js");
              await cpRecursive(join(globalDir, name), join(agentsDir, name));
              await rm(join(globalDir, name), { recursive: true, force: true });
            } else {
              throw err;
            }
          }
          console.log(`  Migrated ${name} → ${agentsDir}`);
        }

        // Save migrated skills to store/registry
        await save({
          skillsDir: agentsDir,
          registryPath: opts.registryPath,
          storePath: opts.storePath,
        });

        // Remove now-empty globalDir and create symlink
        await rm(globalDir, { recursive: true, force: true });
        await createSymlink(agentsDir, globalDir);
      }
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      // Does not exist — create symlink
      await createSymlink(agentsDir, globalDir);
    } else {
      throw err;
    }
  }

  // 6. Update config
  const config = await readConfig(opts.configPath);
  const merged = [...new Set([...config.clients, clientId])];
  await writeConfig({ clients: merged }, opts.configPath);

  // 7. Project-level symlink logic (unchanged)
  if (opts.projectRoot) {
    const subdir = getClientProjectSubdir(clientId);
    if (subdir) {
      const symlinkPath = join(opts.projectRoot, subdir);
      const agentsSkillsDir = join(opts.projectRoot, ".agents", "skills");

      await mkdir(agentsSkillsDir, { recursive: true });

      try {
        const st = await lstat(symlinkPath);
        if (st.isSymbolicLink()) {
          const existing = await readlink(symlinkPath);
          if (existing === join("..", ".agents", "skills")) {
            // Correct symlink already exists — skip
          }
        } else if (st.isDirectory()) {
          console.warn(`  ⚠ ${subdir} already exists as a directory, skipping symlink`);
        }
      } catch {
        // Does not exist — create it
        await mkdir(dirname(symlinkPath), { recursive: true });
        await symlink(join("..", ".agents", "skills"), symlinkPath);
        console.log(`  Symlinked ${subdir} → .agents/skills`);
      }
    }
  }

  console.log(`✓ Enabled client: ${clientId}`);
}

async function createSymlink(target: string, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await symlink(target, path);
  console.log(`  Symlinked ${path} → ${target}`);
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
```

Note: The `readRegistry` and `linkToClients`/`unlinkFromClients` imports are removed. A new import for `save` is added. The `rename` function is added to the `fs/promises` import.

- [ ] **Step 2: Run the `clientAdd` tests**

Run: `bun test packages/cli/tests/client-commands.test.ts --test-name-pattern "clientAdd"`
Expected: All clientAdd tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/client.ts
git commit -m "feat: rewrite clientAdd to use symlink instead of copy-based sync"
```

---

### Task 4: Implement `clientRm` Symlink Flow

**Files:**
- Modify: `packages/cli/src/commands/client.ts:107-165` (the `clientRm` function)

- [ ] **Step 1: Rewrite `ClientRmOptions` and `clientRm` function**

Replace the `ClientRmOptions` interface and `clientRm` function with:

```ts
export interface ClientRmOptions {
  configPath: string;
  registryPath: string;
  skillsDir: string;
  /** Override client->dir mapping for testing */
  clientDirOverrides?: Record<string, string>;
  /** Project root for removing project-level symlinks */
  projectRoot?: string;
}

/**
 * Disable a client. If its skills dir is a symlink, removes it.
 * If it's a real directory, errors and asks user to migrate first.
 */
export async function clientRm(
  clientId: string,
  opts: ClientRmOptions
): Promise<void> {
  if (clientId === "agents") {
    throw new Error("'agents' is always enabled and cannot be removed.");
  }

  const globalDir = opts.clientDirOverrides?.[clientId] ?? getClientSkillsDir(clientId);

  // Check globalDir state
  try {
    const st = await lstat(globalDir);
    if (st.isSymbolicLink()) {
      // Just remove the symlink — skills remain in ~/.agents/skills/
      await rm(globalDir);
    } else if (st.isDirectory()) {
      // Real directory — refuse to delete, ask user to migrate first
      throw new Error(
        `${globalDir} is a real directory, not a symlink. Run 'bsk client add ${clientId}' first to migrate it.`
      );
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
    // Does not exist — no-op
  }

  // Update config
  const config = await readConfig(opts.configPath);
  const filtered = config.clients.filter((c) => c !== clientId);
  await writeConfig({ clients: filtered }, opts.configPath);

  // Remove project-level symlinks
  if (opts.projectRoot) {
    const subdir = getClientProjectSubdir(clientId);
    if (subdir) {
      const symlinkPath = join(opts.projectRoot, subdir);
      try {
        const st = await lstat(symlinkPath);
        if (st.isSymbolicLink()) {
          await rm(symlinkPath);
          console.log(`  Removed symlink ${subdir}`);
        }
        // If it's a real directory, leave it alone
      } catch {
        // Does not exist, nothing to do
      }
    }
  }

  console.log(`✓ Disabled client: ${clientId}`);
}
```

Note: No imports of `readRegistry`, `linkToClients`, or `unlinkFromClients` are needed — `clientRm` errors on real directories instead of cleaning them up.

- [ ] **Step 2: Run the `clientRm` tests**

Run: `bun test packages/cli/tests/client-commands.test.ts --test-name-pattern "clientRm"`
Expected: All clientRm tests PASS.

- [ ] **Step 3: Run all client-commands tests**

Run: `bun test packages/cli/tests/client-commands.test.ts`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/client.ts
git commit -m "feat: rewrite clientRm to handle symlink removal"
```

---

### Task 5: Update CLI Signatures (Singular Args, Remove `--clients`/`--no-clients`)

**Files:**
- Modify: `packages/cli/src/cli.ts:48-89,122-174`

- [ ] **Step 1: Remove `--clients` and `--no-clients` from `add` command (lines 56-57, 64-65)**

In `packages/cli/src/cli.ts`, remove these two option lines from the `add` command:

```ts
// REMOVE these lines:
  .option("--clients <clients>", "Link to specific clients only (comma-separated)")
  .option("--no-clients", "Skip linking to client directories")
```

And simplify the action handler to remove client-related options:

```ts
  .action(async (source: string, opts) => {
    await add(source, {
      global: opts.global,
      hardlink: opts.hardlink,
      name: opts.name,
      force: opts.force,
    });
  });
```

- [ ] **Step 2: Remove `--clients` and `--no-clients` from `install` command (lines 78-79, 86-87)**

Same changes as step 1, applied to the `install` command.

- [ ] **Step 3: Remove `--no-clients` from `mv` command (line 128, 134)**

Remove the `--no-clients` option line and the `noClients` parsing from the action handler:

```ts
// REMOVE:
  .option("--no-clients", "Skip linking to client directories (project → global only)")

// In action handler, remove:
      noClients: opts.clients === false,
```

The `mvToGlobal` call becomes:

```ts
      await mvToGlobal(skillName, {
        force: opts.force,
        hardlink: opts.hardlink,
      });
```

- [ ] **Step 4: Change `client add` from variadic to singular (line 151)**

Change:
```ts
client
  .command("add <clients...>")
  .description("Enable client(s) for skill syncing")
  .action(async (clients: string[]) => {
    await clientAdd(clients, {
```

To:
```ts
client
  .command("add <client>")
  .description("Enable a client for skill syncing")
  .action(async (client: string) => {
    await clientAdd(client, {
```

Also add `globalSkillsDir: getGlobalSkillsPath(),` to the opts object.

- [ ] **Step 5: Change `client rm` from variadic to singular (line 164)**

Change:
```ts
client
  .command("rm <clients...>")
  .alias("remove")
  .description("Disable client(s) and remove linked skills")
  .action(async (clients: string[]) => {
    await clientRm(clients, {
```

To:
```ts
client
  .command("rm <client>")
  .alias("remove")
  .description("Disable a client and remove its skills symlink")
  .action(async (client: string) => {
    await clientRm(client, {
```

- [ ] **Step 6: Run client tests**

Run: `bun test packages/cli/tests/client-commands.test.ts`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/cli.ts
git commit -m "feat: change client add/rm to singular args, remove --clients/--no-clients options"
```

---

### Task 6: Remove Client Sync from `add.ts`

**Files:**
- Modify: `packages/cli/src/commands/add.ts:6-7,21-26,104-115`

- [ ] **Step 1: Remove client-related imports (lines 6-7)**

Remove:
```ts
import { linkToClients } from "../core/linker.js";
import { resolveClientDirs, getClientSkillsDir } from "../core/clients.js";
```

- [ ] **Step 2: Remove client-related options from `AddOptions` (lines 21-26)**

Remove these fields from the `AddOptions` interface:
```ts
  /** Override which clients to link to (undefined = use config) */
  clients?: string[];
  /** Skip all client linking */
  noClients?: boolean;
  /** Path to config file (for testing) */
  configPath?: string;
```

- [ ] **Step 3: Remove client sync block (lines 104-115)**

Remove the entire block:
```ts
  // 7b. Link to client directories (global only)
  if (options.global && !options.noClients) {
    let clientDirs: string[];
    if (options.clients?.length) {
      clientDirs = options.clients.map((c) => getClientSkillsDir(c));
    } else {
      clientDirs = await resolveClientDirs(options.configPath);
    }
    if (clientDirs.length > 0) {
      await linkToClients(skillName, store.getHashPath(hash), clientDirs, { hardlink: options.hardlink });
    }
  }
```

- [ ] **Step 4: Run tests**

Run: `bun test packages/cli/tests/`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/add.ts
git commit -m "refactor: remove client sync from add command"
```

---

### Task 7: Remove Client Sync from `save.ts`

**Files:**
- Modify: `packages/cli/src/commands/save.ts:135-148`

- [ ] **Step 1: Remove client sync block (lines 135-148)**

Remove the entire block at the end of the `save` function:
```ts
  // Sync to enabled client directories
  const { resolveClientDirs } = await import("../core/clients.js");
  const { linkToClients } = await import("../core/linker.js");
  const clientDirs = await resolveClientDirs();
  if (clientDirs.length > 0 && saved > 0) {
    const updatedRegistry = await readRegistry(registryPath);
    for (const [name, entry] of Object.entries(updatedRegistry.skills)) {
      const latestVer = entry.versions.reduce((best, v) => (v.v > best.v ? v : best));
      const storeDir = join(storePath, latestVer.hash);
      await linkToClients(name, storeDir, clientDirs);
    }
    console.log(`Synced to ${clientDirs.length} client dir(s).`);
  }
```

- [ ] **Step 2: Remove the `resolveClientDirs` mock from `save.test.ts` (lines 10-13)**

In `packages/cli/tests/save.test.ts`, remove:
```ts
// Mock clients module so save() doesn't sync to real ~/.claude/skills/
mock.module("../src/core/clients.js", () => ({
  resolveClientDirs: async () => [],
}));
```

And change the dynamic import on line 15 to a static import:
```ts
import { save } from "../src/commands/save.js";
```

Also remove `mock` from the imports on line 1 if no other mocks remain:
```ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
```

- [ ] **Step 3: Run tests**

Run: `bun test packages/cli/tests/save.test.ts`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/save.ts packages/cli/tests/save.test.ts
git commit -m "refactor: remove client sync from save command"
```

---

### Task 8: Remove Client Sync from `mv.ts`

**Files:**
- Modify: `packages/cli/src/commands/mv.ts:7-8,49-58,95-103`
- Modify: `packages/cli/tests/mv.test.ts:139-140,164-165,184-185,204-205`

- [ ] **Step 1: Remove client-related imports from `mv.ts` (lines 7-8)**

Remove:
```ts
import { linkToClients } from "../core/linker.js";
import { resolveClientDirs } from "../core/clients.js";
```

- [ ] **Step 2: Remove `noClients` and `configPath` from `MvToGlobalOptions` (lines 54-55,57)**

Remove these fields:
```ts
  noClients?: boolean;
  configPath?: string;
```

- [ ] **Step 3: Remove client sync block from `mvToGlobal` (lines 95-103)**

Remove:
```ts
  // Link to client directories
  if (!options.noClients) {
    const clientDirs = await resolveClientDirs(options.configPath);
    if (clientDirs.length > 0) {
      await linkToClients(name, store.getHashPath(hash), clientDirs, {
        hardlink: options.hardlink,
      });
    }
  }
```

- [ ] **Step 4: Remove `noClients` and `configPath` from test opts in `mv.test.ts`**

In `packages/cli/tests/mv.test.ts`, remove `noClients: true,` and `configPath: join(baseDir, "config.json"),` from all four `mvToGlobal` calls:
- Line 139-140
- Line 164-165
- Line 184-185
- Line 204-205

- [ ] **Step 5: Run tests**

Run: `bun test packages/cli/tests/mv.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/mv.ts packages/cli/tests/mv.test.ts
git commit -m "refactor: remove client sync from mv command"
```

---

### Task 9: Remove Client Sync from `rm.ts`

**Files:**
- Modify: `packages/cli/src/commands/rm.ts:1-2,34-40`

- [ ] **Step 1: Remove `unlinkFromClients` from import (line 1)**

Change:
```ts
import { unlinkSkill, unlinkFromClients } from "../core/linker.js";
```
To:
```ts
import { unlinkSkill } from "../core/linker.js";
```

- [ ] **Step 2: Remove `resolveClientDirs` import (line 2)**

Remove:
```ts
import { resolveClientDirs } from "../core/clients.js";
```

- [ ] **Step 3: Remove client sync block (lines 34-40)**

Remove:
```ts
  // Remove from client directories (global only)
  if (options.global) {
    const clientDirs = await resolveClientDirs();
    if (clientDirs.length > 0) {
      await unlinkFromClients(name, clientDirs);
    }
  }
```

- [ ] **Step 4: Run tests**

Run: `bun test packages/cli/tests/rm-throw.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/rm.ts
git commit -m "refactor: remove client sync from rm command"
```

---

### Task 10: Remove Client Sync from `profile.ts`

**Files:**
- Modify: `packages/cli/src/commands/profile.ts:3,5,122,136,146-149,180-183,202,267-270,329-332,350,392-396`

- [ ] **Step 1: Remove `linkToClients` and `unlinkFromClients` from import (line 3)**

Change:
```ts
import { unlinkSkill, linkToClients, unlinkFromClients } from "../core/linker.js";
```
To:
```ts
import { unlinkSkill } from "../core/linker.js";
```

- [ ] **Step 2: Remove `resolveClientDirs` import (line 5)**

Remove:
```ts
import { resolveClientDirs } from "../core/clients.js";
```

- [ ] **Step 3: Remove `configPath` from `ProfileUseInternalOptions` (line 122)**

Remove:
```ts
  configPath?: string;
```

- [ ] **Step 4: Remove client sync from `profileUse` — clear phase (lines 136, 146-149)**

Remove line 136:
```ts
  const clientDirs = await resolveClientDirs(opts.configPath);
```

Remove lines 146-149:
```ts
        // Also clear from client dirs
        if (clientDirs.length > 0) {
          await unlinkFromClients(entry.name, clientDirs);
        }
```

- [ ] **Step 5: Remove client sync from `profileUse` — link phase (lines 180-183)**

Remove:
```ts
    // Also link to client dirs
    if (clientDirs.length > 0) {
      await linkToClients(skill.skillName, storeDir, clientDirs, { hardlink: opts.hardlink });
    }
```

- [ ] **Step 6: Remove `configPath` from `ProfileAddInternalOptions` (line 202)**

Remove:
```ts
  configPath?: string;
```

- [ ] **Step 7: Remove client sync from `profileAdd` — registry path (lines 267-270)**

Remove:
```ts
        const clientDirs = await resolveClientDirs(opts.configPath);
        if (clientDirs.length > 0) {
          await linkToClients(skillName, storeDir, clientDirs, { hardlink: opts.hardlink });
        }
```

- [ ] **Step 8: Remove client sync from `profileAdd` — fetch path (lines 329-332)**

Remove:
```ts
      const clientDirs = await resolveClientDirs(opts.configPath);
      if (clientDirs.length > 0) {
        await linkToClients(skillName, storeDir, clientDirs, { hardlink: opts.hardlink });
      }
```

- [ ] **Step 9: Remove `configPath` from `ProfileRmInternalOptions` (line 350)**

Remove:
```ts
  configPath?: string;
```

- [ ] **Step 10: Remove client sync from `profileRm` (lines 392-396)**

Remove:
```ts
    // Unlink from client dirs
    const clientDirs = await resolveClientDirs(opts.configPath);
    if (clientDirs.length > 0) {
      await unlinkFromClients(skillName, clientDirs);
    }
```

- [ ] **Step 11: Remove `configPath` from CLI profile action handlers in `cli.ts`**

In `packages/cli/src/cli.ts`, remove `configPath: getConfigPath(),` from the `profileUse`, `profileAdd`, and `profileRm` action handlers.

- [ ] **Step 12: Run tests**

Run: `bun test packages/cli/tests/profile-commands.test.ts`
Expected: All tests PASS.

- [ ] **Step 13: Commit**

```bash
git add packages/cli/src/commands/profile.ts packages/cli/src/cli.ts
git commit -m "refactor: remove client sync from profile commands"
```

---

### Task 11: Delete Dead Code (`linkToClients`, `unlinkFromClients`, `resolveClientDirs`)

**Files:**
- Modify: `packages/cli/src/core/linker.ts:87-115`
- Modify: `packages/cli/src/core/clients.ts:117-121`
- Delete: `packages/cli/tests/linker-clients.test.ts`
- Modify: `packages/cli/tests/clients.test.ts:136-149`
- Modify: `packages/cli/tests/tui/paste.test.tsx:53`

- [ ] **Step 1: Remove `linkToClients` and `unlinkFromClients` from `linker.ts` (lines 87-115)**

Delete the `linkToClients` function (lines 87-102) and the `unlinkFromClients` function (lines 104-115), including their JSDoc comments.

Remaining exports: `cpRecursive`, `linkSkill`, `unlinkSkill`, `LinkOptions`.

- [ ] **Step 2: Remove `resolveClientDirs` from `clients.ts` (lines 117-121)**

Delete the `resolveClientDirs` function:
```ts
export async function resolveClientDirs(configPath?: string): Promise<string[]> {
  const clients = await getEnabledClients(configPath);
  return clients.map((id) => getClientSkillsDir(id));
}
```

- [ ] **Step 3: Delete `linker-clients.test.ts`**

Delete the entire file `packages/cli/tests/linker-clients.test.ts`.

- [ ] **Step 4: Remove `resolveClientDirs` tests from `clients.test.ts` (lines 136-149)**

Remove the entire `describe("resolveClientDirs", ...)` block.

Also remove `resolveClientDirs` from the import at the top of the file (check exact import statement).

- [ ] **Step 5: Remove `resolveClientDirs` mock from `paste.test.tsx` (line 53)**

In `packages/cli/tests/tui/paste.test.tsx`, remove:
```ts
  resolveClientDirs: mock(() => Promise.resolve([])),
```

- [ ] **Step 6: Run full test suite**

Run: `bun test packages/cli/tests/`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove linkToClients, unlinkFromClients, resolveClientDirs dead code"
```

---

### Task 12: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `bun run test`
Expected: All tests PASS.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No type errors.

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: Build succeeds.

- [ ] **Step 4: Verify no remaining references to deleted functions**

Run: `grep -r "linkToClients\|unlinkFromClients\|resolveClientDirs" packages/cli/src/`
Expected: No matches.

Run: `grep -r "noClients\|--no-clients\|--clients" packages/cli/src/`
Expected: No matches.

- [ ] **Step 5: Commit if any fixups needed**

```bash
git add -A
git commit -m "chore: final cleanup after client symlink refactor"
```
