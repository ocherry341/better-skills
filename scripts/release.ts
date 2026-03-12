import { $ } from "bun";

const arg = Bun.argv[2];
if (!arg) {
  console.error("Usage: bun run release <patch|minor|major|x.y.z>");
  process.exit(1);
}

const pkgPath = "packages/cli/package.json";
const pkg = await Bun.file(pkgPath).json();
const current = pkg.version as string;

function bump(version: string, type: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  switch (type) {
    case "patch": return `${major}.${minor}.${patch + 1}`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "major": return `${major + 1}.0.0`;
    default: return type; // explicit version
  }
}

const next = bump(current, arg);
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`Invalid version: ${next}`);
  process.exit(1);
}

pkg.version = next;
await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

await $`git add ${pkgPath}`;
await $`git commit -m ${next}`;
await $`git tag v${next}`;

console.log(`${current} → ${next}`);
