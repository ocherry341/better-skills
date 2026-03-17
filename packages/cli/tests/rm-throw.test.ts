import { describe, test, expect } from "bun:test";
import { rm } from "../src/commands/rm.js";
import { mkdtemp, rm as fsRm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("rm", () => {
  test("throws when skill not found instead of calling process.exit", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "bsk-rm-"));
    try {
      await expect(
        rm("nonexistent-skill", { global: true })
      ).rejects.toThrow();
    } finally {
      await fsRm(tmp, { recursive: true });
    }
  });
});
