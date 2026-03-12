import { $ } from "bun";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";

const tag = await $`git describe --tags --abbrev=0`.text();
const version = tag.trim().replace(/^v/, '');
const define = `--define=__BSK_VERSION__='\"${version}\"'`;

const targets = [
  { bun: "bun-linux-x64", name: "bsk-linux-x64" },
  { bun: "bun-linux-arm64", name: "bsk-linux-arm64" },
  { bun: "bun-darwin-x64", name: "bsk-darwin-x64" },
  { bun: "bun-darwin-arm64", name: "bsk-darwin-arm64" },
] as const;

const outDir = "dist-binary";
await mkdir(outDir, { recursive: true });

// Stub out react-devtools-core (optional dep of ink, not needed in production binary)
const stubDir = join("node_modules", "react-devtools-core");
await mkdir(stubDir, { recursive: true });
await writeFile(join(stubDir, "package.json"), JSON.stringify({ name: "react-devtools-core", version: "0.0.0", main: "index.js" }));
await writeFile(join(stubDir, "index.js"), "module.exports = {};");

// Allow filtering targets via CLI arg: bun run scripts/build-binary.ts linux-x64
const filter = Bun.argv[2];

try {
  for (const target of targets) {
    if (filter && !target.name.includes(filter)) continue;

    console.log(`Building ${target.name}...`);
    await $`bun build --compile --target=${target.bun} ${define} packages/cli/src/cli.ts --outfile ${outDir}/${target.name}`;
    console.log(`  → ${outDir}/${target.name}`);
  }
} finally {
  await rm(stubDir, { recursive: true, force: true });
}

console.log("Done.");
