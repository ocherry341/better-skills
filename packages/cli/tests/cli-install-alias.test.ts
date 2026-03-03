import { describe, test, expect } from "bun:test";
import { $ } from "bun";

describe("install alias", () => {
  test("'install --help' shows same description as add", async () => {
    const result = await $`bun run packages/cli/src/cli.ts install --help`.text();
    expect(result).toContain("Add a skill from a source");
  });

  test("'i --help' works as alias", async () => {
    const result = await $`bun run packages/cli/src/cli.ts i --help`.text();
    expect(result).toContain("Add a skill from a source");
  });

  test("install supports --global option", async () => {
    const result = await $`bun run packages/cli/src/cli.ts install --help`.text();
    expect(result).toContain("--global");
  });

  test("install supports --copy option", async () => {
    const result = await $`bun run packages/cli/src/cli.ts install --help`.text();
    expect(result).toContain("--copy");
  });

  test("install supports --name option", async () => {
    const result = await $`bun run packages/cli/src/cli.ts install --help`.text();
    expect(result).toContain("--name");
  });
});
