import { describe, test, expect } from "bun:test";
import { fetch } from "../src/core/fetcher.js";

describe("fetcher", () => {
  test("git clone failure gives friendly error", async () => {
    expect(
      fetch({
        type: "github",
        owner: "nonexistent-owner-xxxxx",
        repo: "nonexistent-repo-xxxxx",
      })
    ).rejects.toThrow(/failed to clone/i);
  });
});
