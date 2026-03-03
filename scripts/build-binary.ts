import { $ } from "bun";
import { mkdir } from "fs/promises";

const targets = [
  { bun: "bun-linux-x64", name: "better-skills-linux-x64" },
  { bun: "bun-linux-arm64", name: "better-skills-linux-arm64" },
  { bun: "bun-darwin-x64", name: "better-skills-darwin-x64" },
  { bun: "bun-darwin-arm64", name: "better-skills-darwin-arm64" },
] as const;

const outDir = "dist-binary";
await mkdir(outDir, { recursive: true });

// Allow filtering targets via CLI arg: bun run scripts/build-binary.ts linux-x64
const filter = Bun.argv[2];

for (const target of targets) {
  if (filter && !target.name.includes(filter)) continue;

  console.log(`Building ${target.name}...`);
  await $`bun build --compile --target=${target.bun} packages/cli/src/cli.ts --outfile ${outDir}/${target.name}`;
  console.log(`  → ${outDir}/${target.name}`);
}

console.log("Done.");
