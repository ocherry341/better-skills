# Profile Skill Management Design

> `profile add <source>` and `profile rm <skill-name>`

## Context

Profiles currently snapshot and switch sets of global skills. Missing: the ability to add/remove individual skills to/from a specific profile without switching profiles first.

## Scope Constraint

Profile commands only affect global skills (`~/.agents/skills/`). Project-level skills are independent.

## Commands

### `profile add <source>`

```
better-skills profile add <source> [--profile <name>] [--copy] [-n, --name <name>]
```

- `--profile <name>` — target profile, defaults to active profile
- `--copy`, `-n, --name` — same as `add`

**Flow:**

1. Resolve `--profile` → profile name (default = active; error if none)
2. Resolve → fetch → hash → store (reuse existing core modules)
3. Record skill entry in target profile JSON
4. If target = active profile → also link to `~/.agents/skills/`
5. If target ≠ active → record only, print note

### `profile rm <skill-name>`

```
better-skills profile rm <skill-name> [--profile <name>]
```

**Flow:**

1. Resolve `--profile` → profile name (default = active; error if none)
2. Verify skill exists in profile JSON (error if not)
3. Remove entry from profile JSON
4. If target = active profile → also unlink from `~/.agents/skills/`
5. If target ≠ active → record only

## Implementation

### Approach: Extend existing helpers

New functions `profileAdd()` and `profileRm()` in `commands/profile.ts`. Reuse existing resolver, fetcher, hasher, store, linker modules directly. No refactoring of existing `add`/`rm` commands.

### Files to modify

- `packages/cli/src/commands/profile.ts` — add `profileAdd()`, `profileRm()`
- `packages/cli/src/cli.ts` — register `profile add` and `profile rm` subcommands

### Error handling

- No active profile and no `--profile` → error with message
- `--profile` targets nonexistent profile → error
- `profile rm` skill not in profile → error
- Store hash missing during link → warn, still update profile record

### Testing

- Unit tests for `profileAdd()` and `profileRm()` covering:
  - Add to active profile (record + link)
  - Add to non-active profile (record only)
  - Remove from active profile (record + unlink)
  - Remove from non-active profile (record only)
  - Error: no profile specified and no active profile
  - Error: skill not found in profile (rm)
