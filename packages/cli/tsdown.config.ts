import { execSync } from 'node:child_process'
import { defineConfig } from 'tsdown'

function getVersionFromGitTag(): string {
  try {
    return execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }).trim().replace(/^v/, '')
  } catch {
    return '0.0.0-dev'
  }
}

export default defineConfig({
  entry: ['src/cli.ts', 'src/tui/index.tsx'],
  format: ['esm'],
  outDir: 'dist',
  dts: false,
  clean: true,
  platform: 'node',
  define: {
    __BSK_VERSION__: JSON.stringify(getVersionFromGitTag()),
  },
})
