# Design: TUI Editor Shortcut (`e` key)

**Date:** 2026-04-02
**Status:** Draft

## Summary

Add an `e` keyboard shortcut to the TUI Skills tab that opens the selected skill's directory in the user's `$EDITOR`. This requires temporarily leaving ink's fullscreen alternate buffer, spawning the editor as a child process, then restoring the TUI on editor exit.

## Approach

**Manual escape sequences + ActionMode guard.** No new dependencies. Uses the existing `actionMode` pattern to block TUI input while the editor is running, and raw ANSI escape sequences to leave/re-enter the alternate screen buffer.

### Why this approach

- Minimal code changes across a small number of files
- Follows existing `actionMode` patterns in `App.tsx` and `SkillsView.tsx`
- Escape sequence approach is battle-tested (vim, less, htop all do this)
- `fullscreen-ink` has no built-in pause/resume API, so escape sequences are the only option short of unmounting the entire ink instance (which loses all TUI state)

## Design

### 1. New ActionMode variant

Add `{ type: "editing" }` to the `ActionMode` union in `App.tsx`:

```typescript
export type ActionMode =
  | null
  | { type: "editing" }  // NEW
  | { type: "search" }
  | // ... existing variants
```

This variant blocks all keyboard input (both the modal `useInput` in `App.tsx` and the non-modal `useInput` in `SkillsView.tsx`) while the editor process is running. No UI prompt is rendered for this mode — the alternate buffer is hidden.

### 2. Keyboard handler in SkillsView

Add `e` to the existing `useInput` callback in `SkillsView.tsx`, after the `!selected` guard (same position as `d`, `m`, `s`):

```typescript
if (input === "e" && onEdit) {
  onEdit(selected);
}
```

Add a new `onEdit` callback prop to `SkillsViewProps`:

```typescript
onEdit?: (skill: SkillDetail) => void;
```

### 3. Editor spawning logic in App.tsx

Wire `onEdit` in the `<SkillsView>` JSX in `App.tsx`. The handler:

1. Determines the skill directory path:
   - If `skill.global`: `join(getGlobalSkillsPath(), skill.name)`
   - Otherwise: `join(getProjectSkillsPath(), skill.name)`
2. Guards against inactive skills (no linked directory): shows a notification and returns early
3. Sets `actionMode` to `{ type: "editing" }` to block input
4. Calls an async `openInEditor()` helper (see below)
5. On completion, sets `actionMode` back to `null` and refreshes the skills list (in case the user edited `SKILL.md` or other files)

```typescript
onEdit={(skill) => {
  if (skill.inactive) {
    showNotification("Skill has no linked directory", "error");
    return;
  }
  const dir = skill.global
    ? join(getGlobalSkillsPath(), skill.name)
    : join(getProjectSkillsPath(), skill.name);
  setActionMode({ type: "editing" });
  openInEditor(dir).finally(() => {
    setActionMode(null);
    refresh();
  });
}}
```

### 4. `openInEditor()` utility function

Create a new utility at `packages/cli/src/tui/utils/openEditor.ts`:

```typescript
import { spawn } from "node:child_process";

const LEAVE_ALT_BUFFER = "\x1b[?1049l";
const ENTER_ALT_BUFFER = "\x1b[?1049h";

export function openInEditor(path: string): Promise<void> {
  const editor = process.env.EDITOR || "vi";
  return new Promise((resolve, reject) => {
    // Leave alternate screen buffer so editor gets normal terminal
    process.stdout.write(LEAVE_ALT_BUFFER);

    const child = spawn(editor, [path], {
      stdio: "inherit",
    });

    child.on("error", (err) => {
      process.stdout.write(ENTER_ALT_BUFFER);
      reject(err);
    });

    child.on("close", () => {
      // Re-enter alternate screen buffer and clear it
      process.stdout.write(ENTER_ALT_BUFFER);
      process.stdout.write("\x1b[2J\x1b[H"); // clear screen + cursor home
      resolve();
    });
  });
}
```

Key details:
- Uses `spawn` with `stdio: "inherit"` so the editor gets full terminal control (stdin, stdout, stderr)
- `$EDITOR` env var with `vi` fallback
- Escape sequences are always restored in both success and error paths
- After restoring the alternate buffer, clears the screen so ink redraws cleanly

### 5. StatusBar hints update

In `SkillsView.tsx`, add `{ key: "e", label: "Edit" }` to the shortcuts array, placed after "Add" and before "Delete" for logical grouping:

```typescript
const shortcuts: Shortcut[] = [
  { key: "a", label: "Add" },
  { key: "e", label: "Edit" },   // NEW
  { key: "d", label: "Delete" },
  { key: "m", label: "Move" },
  { key: "s", label: "Save" },
  { key: "A", label: showAll ? "Active only" : "Show all" },
  { key: "/", label: "Search" },
  { key: "?", label: "Help" },
  { key: "q", label: "Quit" },
];
```

### 6. HelpOverlay update

In `HelpOverlay.tsx`, add a binding to the `Skills` entry in `TAB_BINDINGS`:

```typescript
Skills: [
  { keys: "a", action: "Add skill" },
  { keys: "e", action: "Edit skill in $EDITOR" },   // NEW
  { keys: "d", action: "Delete skill" },
  { keys: "m", action: "Move skill (global/project)" },
  { keys: "/", action: "Search skills" },
],
```

## Files Changed

| File | Change |
|---|---|
| `packages/cli/src/tui/App.tsx` | Add `"editing"` to `ActionMode` union; wire `onEdit` prop on `<SkillsView>`; import `openInEditor` and `getProjectSkillsPath` |
| `packages/cli/src/tui/components/SkillsView.tsx` | Add `onEdit` prop; handle `e` key in `useInput`; add "Edit" to shortcuts array |
| `packages/cli/src/tui/components/HelpOverlay.tsx` | Add `e` binding to `TAB_BINDINGS.Skills` |
| `packages/cli/src/tui/utils/openEditor.ts` | **New file.** `openInEditor(path)` utility |

## Edge Cases and Error Handling

| Scenario | Behavior |
|---|---|
| `$EDITOR` not set | Falls back to `vi` |
| Inactive skill (no linked directory) | Shows error notification: "Skill has no linked directory" |
| Editor binary not found | `spawn` emits `error` event; alternate buffer is restored; promise rejects; `App.tsx` `.finally()` clears `actionMode`. The error is silently swallowed (no notification) since the user will see the shell error in the brief moment before the buffer switches back. |
| Editor crashes / non-zero exit | `close` event fires regardless; alternate buffer is restored; TUI resumes normally |
| Skill exists in both global and project | Opens the one matching the `global` field on the selected `SkillDetail` (global if `global` is true, project otherwise) |
| User presses `e` with no skill selected | Blocked by existing `if (!selected) return` guard in `SkillsView` |
| User presses `e` while a modal is open | Blocked by existing `actionMode !== null` guard |

## Testing

Manual testing only — spawning an external editor and managing alternate screen buffers involves terminal I/O that cannot be unit tested. Test matrix:

1. Press `e` on a global skill — opens `~/.agents/skills/<name>` in `$EDITOR`
2. Press `e` on a project skill — opens `./.agents/skills/<name>` in `$EDITOR`
3. Press `e` on an inactive skill — shows error notification
4. Press `e` with no skill selected (empty list) — nothing happens
5. Press `e` while a modal is open (e.g. delete confirm) — nothing happens
6. Quit the editor — TUI resumes cleanly with no visual artifacts
7. Unset `$EDITOR` — falls back to `vi`
8. Set `$EDITOR` to a nonexistent binary — error is handled, TUI resumes

## Open Questions

None. All design decisions have been resolved.
