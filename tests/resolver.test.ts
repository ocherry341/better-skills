import { describe, test, expect } from "bun:test";
import { resolve, toSourceString, toGitUrl } from "../src/core/resolver.js";

describe("resolver", () => {
  test("owner/repo → github", () => {
    const result = resolve("owner/repo");
    expect(result).toEqual({ type: "github", owner: "owner", repo: "repo" });
  });

  test("owner/repo/sub/dir → github with subdir", () => {
    const result = resolve("owner/repo/sub/dir");
    expect(result).toEqual({
      type: "github",
      owner: "owner",
      repo: "repo",
      subdir: "sub/dir",
    });
  });

  test("https://github.com/owner/repo → github", () => {
    const result = resolve("https://github.com/owner/repo");
    expect(result).toEqual({ type: "github", owner: "owner", repo: "repo" });
  });

  test("https://github.com/owner/repo.git → github", () => {
    const result = resolve("https://github.com/owner/repo.git");
    expect(result).toEqual({ type: "github", owner: "owner", repo: "repo" });
  });

  test("https://github.com/owner/repo/tree/main/sub/dir → github with subdir", () => {
    const result = resolve("https://github.com/owner/repo/tree/main/sub/dir");
    expect(result).toEqual({
      type: "github",
      owner: "owner",
      repo: "repo",
      subdir: "sub/dir",
    });
  });

  test("git@github.com:owner/repo.git → git", () => {
    const result = resolve("git@github.com:owner/repo.git");
    expect(result).toEqual({ type: "git", url: "git@github.com:owner/repo.git" });
  });

  test("./path → local", () => {
    const result = resolve("./my-skill");
    expect(result).toEqual({ type: "local", path: "./my-skill" });
  });

  test("/abs/path → local", () => {
    const result = resolve("/abs/path");
    expect(result).toEqual({ type: "local", path: "/abs/path" });
  });

  test("../relative → local", () => {
    const result = resolve("../other-skill");
    expect(result).toEqual({ type: "local", path: "../other-skill" });
  });

  test("single word throws", () => {
    expect(() => resolve("notsource")).toThrow();
  });
});

describe("toSourceString", () => {
  test("github → owner/repo", () => {
    expect(toSourceString({ type: "github", owner: "o", repo: "r" })).toBe("o/r");
  });

  test("github with subdir → owner/repo/sub", () => {
    expect(
      toSourceString({ type: "github", owner: "o", repo: "r", subdir: "sub" })
    ).toBe("o/r/sub");
  });

  test("local → path", () => {
    expect(toSourceString({ type: "local", path: "./foo" })).toBe("./foo");
  });
});

describe("toGitUrl", () => {
  test("github → https clone URL", () => {
    expect(toGitUrl({ type: "github", owner: "o", repo: "r" })).toBe(
      "https://github.com/o/r.git"
    );
  });

  test("git → direct URL", () => {
    expect(toGitUrl({ type: "git", url: "git@host:repo.git" })).toBe(
      "git@host:repo.git"
    );
  });

  test("local → throws", () => {
    expect(() => toGitUrl({ type: "local", path: "./foo" })).toThrow();
  });
});
