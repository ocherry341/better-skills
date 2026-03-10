import { describe, test, expect } from "bun:test";
import { $ } from "bun";
import { join } from "path";

const cli = join(import.meta.dir, "../src/cli.ts");

describe("install alias", () => {
  test("'install --help' shows same description as add", async () => {
    const result = await $`bun run ${cli} install --help`.text();
    expect(result).toContain("Add a skill from a source");
  });

  test("'i --help' works as alias", async () => {
    const result = await $`bun run ${cli} i --help`.text();
    expect(result).toContain("Add a skill from a source");
  });

  test("install supports --global option", async () => {
    const result = await $`bun run ${cli} install --help`.text();
    expect(result).toContain("--global");
  });

  test("install supports --hardlink option", async () => {
    const result = await $`bun run ${cli} install --help`.text();
    expect(result).toContain("--hardlink");
  });

  test("install supports --name option", async () => {
    const result = await $`bun run ${cli} install --help`.text();
    expect(result).toContain("--name");
  });
});
