# better-skills (`bsk`)

A pnpm-inspired CLI for managing Agent skills with content-addressable storage.

**better-skills** lets you add, version, and sync reusable AI agent skills across multiple clients (Claude, Cursor, Copilot, Gemini, and more) — with deduplication, profiles, and zero lock-in.

## Features

- **Content-addressable storage** — Skills are SHA-256 hashed and deduplicated in a global store
- **Multi-client support** — Sync skills to Claude, Cursor, OpenCode, Gemini, Copilot, Roo, Goose, and Amp simultaneously
- **Profile management** — Create named skill collections, switch between them instantly
- **Version tracking** — Every save creates a new version; reference any version by number
- **Global & project scopes** — Install skills user-wide or per-project, move them freely between scopes
- **Multiple sources** — Add skills from GitHub repos, git URLs, or local paths

## Installation

### npm

```bash
npm install -g better-skills
```

Requires Node.js >= 18.

### Binary

```bash
curl -fsSL https://raw.githubusercontent.com/ocherry341/better-skills/main/packages/install/install.sh | bash
```

Installs a platform-specific binary to `~/.local/bin/`. Supports Linux (x64/arm64) and macOS (x64/arm64).

You can also download binaries directly from the [GitHub Releases](https://github.com/ocherry341/better-skills/releases) page.

## Quick Start

```bash
# Launch interactive TUI
bsk

# Add a skill from GitHub
bsk add owner/repo

# Add a skill from a subdirectory
bsk add owner/repo/path/to/skill

# Add from a local path
bsk add ./my-skill

# List active skills
bsk ls

# List all managed skills (including inactive)
bsk ls -a
```

## Already Have Skills?

Still managing your skills manually? Just one command to unlock the full power of `bsk`:

```bash
bsk save
```

Versioning, deduplication, profile switching — all yours, instantly.

## Commands

### Skill Management

```bash
bsk add <source>          # Add a skill (github, git, local path)
bsk install <source>      # Alias for add (also: bsk i)
bsk rm <name>             # Remove a skill
bsk ls [-a]               # List skills (-a for all managed)
bsk save [name]           # Save new/changed skills to management (--adopt-orphans)
bsk mv <skill> <scope>    # Move skill between global/project scope
bsk tui                   # Launch interactive TUI (also: bare bsk)
```

Options for `add` / `install`:

```bash
-g, --global        # Install to global skills directory
-n, --name <name>   # Override the skill name
-f, --force         # Overwrite unmanaged skills
-y, --yes           # Skip confirmation prompts
--hardlink           # Use hard links instead of file copy
```

### Source Formats

```bash
bsk add owner/repo                              # GitHub repo root
bsk add owner/repo/subdir                       # GitHub subdirectory
bsk add https://github.com/owner/repo           # Full GitHub URL
bsk add https://github.com/owner/repo/tree/main/subdir  # Branch + path
bsk add https://gitlab.com/owner/repo           # Any HTTPS git URL
bsk add git@github.com:owner/repo.git           # Git SSH
bsk add ./local/path                            # Local directory (also ../ and /abs)
```

### Profiles

Profiles are named snapshots of skill collections with version references.

```bash
bsk profile create <name>     # Create a profile from current skills
bsk profile ls                # List all profiles
bsk profile show [name]       # Show profile details
bsk profile use <name>        # Switch to a profile
bsk profile add <skill>       # Add a skill to active profile
bsk profile rm <skill>        # Remove a skill from active profile
bsk profile clone <from> <to> # Clone a profile
bsk profile rename <old> <new>
bsk profile delete <name>
```

Version specifiers for profile operations:

```bash
bsk profile add my-skill@latest     # Latest version
bsk profile add my-skill@previous   # Previous version
bsk profile add my-skill@v2         # Specific version
bsk profile add my-skill@~1         # Relative (latest minus 1)
bsk profile add my-skill@abc123     # Hash prefix match
```

### Multi-Client

Enable additional clients to automatically sync skills to their directories.

```bash
bsk client ls                          # List enabled clients
bsk client add claude cursor gemini    # Enable clients
bsk client rm cursor                   # Disable a client
```

Supported clients: `claude`, `cursor`, `opencode`, `gemini`, `copilot`, `roo`, `goose`, `amp`

### Store

```bash
bsk store verify    # Check integrity of all store entries
bsk store ls        # List all store entries with skill/version info
```

### Sync & Backup

```bash
bsk sync restore                    # Restore skills from active profile + rebuild client symlinks
bsk sync export [-o <path>]         # Export ~/.better-skills to a tar.gz archive
bsk sync import <file> [-y]         # Import from archive and auto-restore
bsk cd                              # Open a shell in ~/.better-skills
```

Use `sync restore` after syncing your `~/.better-skills` directory (e.g., via git, Syncthing, or cloud storage). Use `export`/`import` for one-time backups.

## How It Works

### Skill Format

Skills are directories containing a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: my-skill
description: What this skill does
---

# My Skill

Instructions for the AI agent...
```

### Storage Architecture

```
~/.better-skills/
├── store/{hash}/        # Content-addressable store (immutable)
├── registry.json        # Tracks all skill versions and hashes
├── profiles/            # Named skill collections
├── active-profile       # Currently active profile name
├── config.json          # Enabled clients
└── tmp/                 # Temporary directory for git clones

~/.agents/skills/        # Global skills (copied from store)
./.agents/skills/        # Project skills
```

1. **Add** — Skill is fetched, hashed, and stored in `~/.better-skills/store/{hash}/`
2. **Link** — Files are copied from the store to skill directories (use `--hardlink` for hard links)
3. **Sync** — Copies are replicated to all enabled client directories (e.g., `~/.claude/skills/`, `~/.cursor/skills/`)
4. **Version** — Each save creates a new registry entry; old versions remain in store

### Deduplication

Identical skills across projects share a single store entry. The SHA-256 hash is computed deterministically from file paths and contents, so the same skill always produces the same hash.

## Roadmap

- [x] **TUI** — Interactive terminal UI for managing skills
- [ ] **Built-in `use better-skills` skill** — A bundled skill that teaches agents how to use `bsk`
- [ ] **Git repo linking** — Link your skill storage to git repo
- [ ] **Skills security audit** — Security review and sandboxing for skill content

## Development

This is a Bun workspace monorepo.

```bash
bun install              # Install dependencies
bun run dev              # Run CLI from source
bun run build            # Build (tsdown → dist/cli.mjs)
bun run test             # Run tests
bun run typecheck        # TypeScript strict check
bun run build:binary     # Compile cross-platform binaries
```

## License

MIT
