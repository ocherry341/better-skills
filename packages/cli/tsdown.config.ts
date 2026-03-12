import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  outDir: 'dist',
  dts: false,
  clean: true,
  platform: 'node',
  define: {
    __BSK_VERSION__: JSON.stringify(pkg.version),
  },
})
