# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

All commands run from the repo root (Bun workspace monorepo):

```bash
bun install              # Install dependencies
bun run build            # Build CLI (tsdown → packages/cli/dist/cli.mjs)
bun run test             # Run all tests
bun run typecheck        # TypeScript strict type checking
bun run dev              # Run CLI directly from source (bun run src/cli.ts)
bun run build:binary     # Compile cross-platform binaries via Bun
```

Run a single test file:
```bash
bun test packages/cli/tests/resolver.test.ts
```

Tests use Bun's built-in test runner (`bun:test`). The test command filters to the `better-skills` workspace package.

## Architecture

**better-skills** (`bsk`) is a pnpm-inspired CLI for managing Agent skills (`.agents/skills/` directories) with content-addressable storage.

### Key paths

- **Global store**: `~/.better-skills/store/{hash}/`
- **Global skills dir**: `~/.agents/skills/`
- **Project skills dir**: `./.agents/skills/`

### CLI commands

- Use commander.js for CLI parsing.

## Code Conventions

- ESM-only (`"type": "module"`), TypeScript with strict mode
- Source uses `@/*` path alias mapping to `./src/*` (tsconfig paths)
- Imports use `.js` extensions (for Node ESM compatibility)
- Bun types are used for runtime APIs
