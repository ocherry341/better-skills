import { describe, test, expect } from "bun:test";

describe("rm", () => {
  test("throws when skill not found instead of calling process.exit", async () => {
    const { rm } = await import("../src/commands/rm.js");
    await expect(
      rm("nonexistent-skill", { global: true })
    ).rejects.toThrow();
  });
});
