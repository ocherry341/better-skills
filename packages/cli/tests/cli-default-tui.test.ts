import { describe, test, expect } from "bun:test";
import { $ } from "bun";
import { join } from "path";

const cli = join(import.meta.dir, "../src/cli.ts");

describe("bsk no-args launches TUI", () => {
  test("running bsk with no arguments does not show help text", async () => {
    // Run with a timeout so the TUI doesn't hang; it will fail to render
    // in a non-TTY environment but should NOT output help text.
    const proc = Bun.spawn(["bun", "run", cli], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, NO_COLOR: "1" },
    });

    // Give it a moment then kill — we just need to confirm help is not shown
    const timeout = setTimeout(() => proc.kill(), 1000);
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    clearTimeout(timeout);

    // Help text contains "Usage:" and command listings — these should NOT appear
    expect(stdout).not.toContain("Usage:");
    expect(stdout).not.toContain("Commands:");
  });

  test("--help still shows help text", async () => {
    const result = await $`bun run ${cli} --help`.text();
    expect(result).toContain("Usage:");
  });

  test("tui subcommand is still available", async () => {
    const result = await $`bun run ${cli} --help`.text();
    expect(result).toContain("tui");
  });
});
