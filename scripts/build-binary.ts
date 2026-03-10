import { $ } from "bun";
import { mkdir } from "fs/promises";

const pkg = await Bun.file("packages/cli/package.json").json();
const define = `--define=__BSK_VERSION__='\"${pkg.version}\"'`;

const targets = [
  { bun: "bun-linux-x64", name: "bsk-linux-x64" },
  { bun: "bun-linux-arm64", name: "bsk-linux-arm64" },
  { bun: "bun-darwin-x64", name: "bsk-darwin-x64" },
  { bun: "bun-darwin-arm64", name: "bsk-darwin-arm64" },
] as const;

const outDir = "dist-binary";
await mkdir(outDir, { recursive: true });

// Allow filtering targets via CLI arg: bun run scripts/build-binary.ts linux-x64
const filter = Bun.argv[2];

for (const target of targets) {
  if (filter && !target.name.includes(filter)) continue;

  console.log(`Building ${target.name}...`);
  await $`bun build --compile --target=${target.bun} ${define} packages/cli/src/cli.ts --outfile ${outDir}/${target.name}`;
  console.log(`  → ${outDir}/${target.name}`);
}

console.log("Done.");
