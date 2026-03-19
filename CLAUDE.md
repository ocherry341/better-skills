# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

All commands run from the repo root (Bun workspace monorepo with `packages/cli` and `packages/install`):

```bash
bun install              # Install dependencies
bun run build            # Build CLI (tsdown → packages/cli/dist/cli.mjs)
bun run test             # Run all tests
bun run typecheck        # TypeScript strict type checking
bun run dev              # Run CLI directly from source (bun run src/cli.ts)
bun run build:binary     # Compile cross-platform binaries via Bun
bun run release          # Run release script (scripts/release.ts)
```

Run a single test file:
```bash
bun test packages/cli/tests/resolver.test.ts
```

Tests use Bun's built-in test runner (`bun:test`). The test command filters to the `better-skills` workspace package.

## Architecture

**better-skills** (`bsk`) is a pnpm-inspired CLI for managing Agent skills (`.agents/skills/` directories) with content-addressable storage. Uses ink (React-based terminal UI) for the TUI interface.

### Key paths

- **Global store**: `~/.better-skills/store/{hash}/`
- **Global skills dir**: `~/.agents/skills/`
- **Project skills dir**: `./.agents/skills/`
- **Profiles dir**: `~/.better-skills/profiles/`
- **Registry**: `~/.better-skills/registry.json`
- **Config**: `~/.better-skills/config.json`

### CLI commands

Uses commander.js and zod for CLI parsing and validation. Main commands:

- `bsk add <source>` / `bsk install <source>` — add a skill (github, git, or local path)
- `bsk rm <name>` — remove a skill
- `bsk ls` — list active skills; `bsk ls -a` lists all managed skills
- `bsk save [name]` — save new/changed skills to bsk management
- `bsk mv <skill> <global|project>` — move a skill between scopes
- `bsk client add|rm|ls` — manage multi-client skill directories
- `bsk profile create|ls|show|use|add|rm|delete|rename|clone` — manage skill profiles
- `bsk store verify|ls` — check store integrity or list store entries
- `bsk tui` — interactive terminal UI for managing skills

## Code Conventions

- ESM-only (`"type": "module"`), TypeScript with strict mode
- Source uses `@/*` path alias mapping to `./src/*` (tsconfig paths)
- Imports use `.js` extensions (for Node ESM compatibility)
- Bun types are used for runtime APIs
