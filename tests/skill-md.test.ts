import { describe, test, expect } from "bun:test";
import { parseFrontmatter } from "../src/utils/skill-md.js";

describe("parseFrontmatter", () => {
  test("parses basic frontmatter", () => {
    const content = `---
name: my-skill
description: A test skill
---
# My Skill

Some content here.`;

    const result = parseFrontmatter(content);
    expect(result.name).toBe("my-skill");
    expect(result.description).toBe("A test skill");
  });

  test("handles missing optional fields", () => {
    const content = `---
name: minimal
---
content`;

    const result = parseFrontmatter(content);
    expect(result.name).toBe("minimal");
  });

  test("throws when no frontmatter", () => {
    expect(() => parseFrontmatter("no frontmatter here")).toThrow(
      "No YAML frontmatter found"
    );
  });

  test("throws when name is missing", () => {
    const content = `---
description: no name
---`;

    expect(() => parseFrontmatter(content)).toThrow("must include 'name'");
  });

  test("handles extra fields", () => {
    const content = `---
name: my-skill
version: 1.0.0
author: someone
---`;

    const result = parseFrontmatter(content);
    expect(result.name).toBe("my-skill");
    expect(result.version).toBe("1.0.0");
  });
});
