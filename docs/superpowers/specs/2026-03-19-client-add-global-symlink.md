# Design: `bsk client add` Global Symlink Refactor

**Date:** 2026-03-19
**Status:** Draft
**Branch:** `feature/client-add-global-symlink`

## Summary

Change `bsk client add <client>` so that, for global scope, the client's skills directory becomes a symlink to `~/.agents/skills/` instead of receiving individual skill copies. This eliminates the need for all copy-based client sync logic across the codebase.

## Motivation

Currently, every time a skill is added, saved, moved, or a profile is switched, each enabled client's `globalDir` receives a full copy of every managed skill from the content-addressable store. This is wasteful:

- Disk space: N clients = N+1 copies of every skill (one in `~/.agents/skills/`, one per client)
- Complexity: Every command that modifies skills must remember to sync to client dirs
- Consistency: Client dirs can drift out of sync if a sync step is missed or fails

A symlink from `~/.claude/skills/` to `~/.agents/skills/` means all clients see the same skills instantly, with zero sync logic.

## Approach

**Inline refactor of `clientAdd`** (Approach A from brainstorming). The change is well-scoped and fits naturally in the existing function. No new modules or commands needed.

## Detailed Design

### 1. CLI Signature Change

**File:** `packages/cli/src/cli.ts` (lines 150-161)

Change from variadic to single argument:

```
// Before
client.command("add <clients...>")
// After
client.command("add <client>")
```

The action handler passes a single string instead of `string[]`.

### 2. `clientAdd` Function Rewrite

**File:** `packages/cli/src/commands/client.ts`

#### New signature

```ts
export async function clientAdd(
  clientId: string,
  opts: ClientAddOptions
): Promise<void>
```

`ClientAddOptions` stays the same, plus a new optional field:

```ts
export interface ClientAddOptions {
  configPath: string;
  registryPath: string;
  storePath: string;
  skillsDir: string;               // ~/.agents/skills/
  clientDirOverrides?: Record<string, string>;
  projectRoot?: string;
  /** Override for the global skills path (testing) */
  globalSkillsDir?: string;
}
```

#### New global-scope flow

```
clientAdd("claude", opts)
  1. Validate clientId (not "agents", must be in CLIENT_REGISTRY)
  2. Resolve globalDir = clientDirOverrides[id] ?? getClientSkillsDir(id)
     Resolve agentsDir = opts.globalSkillsDir ?? getGlobalSkillsPath()
  3. Check globalDir state:
     a. lstat(globalDir)
        - Is symlink?
          - readlink → points to agentsDir? → print "already enabled", skip to step 7
          - Points elsewhere? → error: "symlink exists but points to <target>"
        - Is directory?
          - readdir → empty? → rm + skip to step 5
          - Has content? → go to step 4
        - Does not exist? → skip to step 5
  4. Conflict check + migration:
     a. Scan subdirs of globalDir
     b. Scan subdirs of agentsDir
     c. If any name exists in BOTH → error with list of conflicts, touch nothing
     d. No conflicts → for each subdir in globalDir:
        - rename(globalDir/subdir, agentsDir/subdir)
     e. Call save() to register moved skills in store/registry
     f. rm(globalDir) (now empty after moves)
  5. Create symlink:
     a. mkdir(dirname(globalDir), { recursive: true })
     b. symlink(agentsDir, globalDir)
     c. Print "Symlinked <globalDir> -> ~/.agents/skills/"
  6. Update config (add clientId to config.clients)
  7. Project-level symlink logic (unchanged from current implementation)
  8. Print success message
```

#### Key details

- **Step 4d uses `rename`** (atomic move on same filesystem). Since both `globalDir` and `agentsDir` are under `$HOME`, this should always be same-filesystem.
- **Step 4e calls `save()`** with `skillsDir` pointing to `agentsDir` so the moved skills get hashed, stored, and registered. This uses the existing `save` function.
- **Step 3a symlink check** uses `lstat` (not `stat`) to detect symlinks without following them. Then `readlink` to check the target.
- **Conflict detection** (step 4c) only checks top-level subdirectory names — each skill is a single subdirectory.

### 3. `clientRm` Changes

**File:** `packages/cli/src/commands/client.ts`

Change signature from `clientIds: string[]` to `clientId: string` (matching `clientAdd`).

For global scope: if `globalDir` is a symlink, just remove the symlink (`rm(globalDir)`). Skills remain in `~/.agents/skills/`. No need to call `unlinkFromClients` since there are no copied files to clean up.

If `globalDir` is a real directory (legacy state), keep existing behavior of removing individual skill links.

```
clientRm("claude", opts)
  1. Validate clientId
  2. Resolve globalDir
  3. lstat(globalDir):
     - Is symlink → rm(globalDir)
     - Is real directory → legacy cleanup: unlinkFromClients for each managed skill
     - Does not exist → no-op
  4. Update config (remove clientId)
  5. Remove project-level symlink (unchanged)
  6. Print success
```

CLI signature also changes: `client.command("rm <client>")` (singular).

### 4. Remove All Copy-Based Client Sync Logic

Since client dirs are now symlinks to `~/.agents/skills/`, copying skills into them is unnecessary (and harmful — it would write files back into the source directory).

**Remove client sync from these files:**

| File | Lines | What to remove |
|------|-------|----------------|
| `commands/add.ts` | 104-114 | `linkToClients` call + `resolveClientDirs` + `--clients`/`--no-clients` options |
| `commands/save.ts` | 135-147 | Entire "Sync to enabled client directories" block |
| `commands/mv.ts` | 95-103 | `linkToClients` call + `resolveClientDirs` + `--no-clients` option |
| `commands/rm.ts` | 34-40 | `unlinkFromClients` call + `resolveClientDirs` |
| `commands/profile.ts` | 136,147-149 | `unlinkFromClients` in `profileUse` clear phase |
| `commands/profile.ts` | 181-182 | `linkToClients` in `profileUse` re-link phase |
| `commands/profile.ts` | 267-269 | `linkToClients` in `profileAdd` |
| `commands/profile.ts` | 329-331 | `linkToClients` in `profileRm` re-link |
| `commands/profile.ts` | 393-395 | `unlinkFromClients` in profile rm |

**Also remove from CLI options** (`cli.ts`):
- `--clients` and `--no-clients` options from `add`, `install`, and `mv` commands
- Related option parsing in action handlers

**Also remove/clean up:**
- `resolveClientDirs` from `core/clients.ts` (no longer called anywhere)
- `linkToClients` and `unlinkFromClients` from `core/linker.ts` (no longer called by any command)
- Related imports across all files

### 5. `clientLs` Changes

**File:** `packages/cli/src/commands/client.ts`

No functional changes needed. The listing already shows `globalDir` paths and enabled status. Optionally, add a visual indicator showing whether the dir is currently a symlink:

```
  * claude      ~/.claude/skills/ -> ~/.agents/skills/  (symlink)
    cursor      ~/.cursor/skills/                       (not enabled)
```

### 6. Error Handling

| Scenario | Behavior |
|----------|----------|
| Unknown client ID | Error: "Unknown client '<id>'. Valid clients: ..." |
| `clientId === "agents"` | Error: "'agents' is always enabled and cannot be added." |
| globalDir is symlink to wrong target | Error: "<globalDir> is a symlink to <target>, not ~/.agents/skills/. Remove it manually first." |
| Name conflicts during migration | Error: "Cannot migrate: skills [x, y] exist in both <globalDir> and ~/.agents/skills/. Resolve conflicts manually." |
| `rename()` fails (cross-device) | Fall back to copy + rm for that skill |
| `~/.agents/skills/` doesn't exist | Create it with `mkdir -p` before symlink |

### 7. Testing Strategy

#### Unit tests to update: `client-commands.test.ts`

- **Remove:** Tests for multi-client add/rm (now single client)
- **Remove:** Tests for syncing existing skills via `linkToClients`
- **Add:** Tests for the new symlink flow:
  - Fresh add (no existing dir) → creates symlink
  - Already a correct symlink → prints "already enabled", no-op
  - Symlink to wrong target → error
  - Empty existing dir → removes dir, creates symlink
  - Existing dir with skills, no conflicts → migrates skills, creates symlink
  - Existing dir with skills, conflicts → error, nothing changed
  - `clientRm` with symlink → removes symlink only
  - `clientRm` with real dir (legacy) → cleans up individual skills

#### Unit tests to update in other files

- `add.ts`, `save.ts`, `mv.ts`, `rm.ts`, `profile.ts` tests: remove any assertions about client dir syncing
- `linker-clients.test.ts`: remove `linkToClients`/`unlinkFromClients` tests (functions deleted)

#### Integration/E2E considerations

- Test the full flow: `client add claude` on a fresh system → verify symlink exists
- Test migration: pre-populate `~/.claude/skills/` with skills, run `client add claude`, verify skills moved to `~/.agents/skills/` and symlink created

### 8. Migration / Backward Compatibility

- **No automatic migration.** Users must run `bsk client add <client>` to convert existing client dirs to symlinks. This is safe because:
  - The command already handles existing dirs with content (step 4)
  - Running `client add` on an already-enabled client will now migrate it
- **Already-enabled clients** in config: Running `client add claude` when claude is already in `config.clients` will still proceed with the symlink migration (the config dedup handles this cleanly).

## Files Changed (Summary)

| File | Change type |
|------|-------------|
| `src/commands/client.ts` | Major rewrite (clientAdd, clientRm) |
| `src/cli.ts` | CLI signature changes (singular args, remove --clients/--no-clients) |
| `src/commands/add.ts` | Remove client sync block + options |
| `src/commands/save.ts` | Remove client sync block |
| `src/commands/mv.ts` | Remove client sync block + options |
| `src/commands/rm.ts` | Remove client sync block |
| `src/commands/profile.ts` | Remove all linkToClients/unlinkFromClients calls |
| `src/core/linker.ts` | Remove linkToClients, unlinkFromClients exports |
| `src/core/clients.ts` | Remove resolveClientDirs |
| `tests/client-commands.test.ts` | Major rewrite |
| `tests/linker-clients.test.ts` | Remove linkToClients/unlinkFromClients tests |
| Various test files | Remove client sync assertions |

## Out of Scope

- TUI changes (`ClientsView.test.tsx`, `useClients.test.tsx`) — TUI uses `clientLs` which is unchanged
- Changing how project-level symlinks work — already uses symlinks correctly
- Automatic migration on startup or via other commands
