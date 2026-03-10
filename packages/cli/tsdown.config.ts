import { defineConfig } from 'tsdown'
import pkg from './package.json'

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
