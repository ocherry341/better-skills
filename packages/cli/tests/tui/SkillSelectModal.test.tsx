import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi } from "./helpers.js";
import { SkillSelectModal } from "../../src/tui/components/SkillSelectModal.js";

describe("SkillSelectModal", () => {
  test("renders skills with cursor and selection markers", () => {
    const { lastFrame, unmount } = render(
      <SkillSelectModal
        source="owner/repo"
        skills={["skill-one", "skill-two"]}
        selectedSkills={["skill-two"]}
        cursorIndex={0}
      />
    );

    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Select skills from owner/repo");
    expect(frame).toContain("▸ [ ] skill-one");
    expect(frame).toContain("  [x] skill-two");
    expect(frame).toContain("1 selected");
    expect(frame).toContain("Enter: continue");
    unmount();
  });

  test("renders error message", () => {
    const { lastFrame, unmount } = render(
      <SkillSelectModal
        source="owner/repo"
        skills={["skill-one"]}
        selectedSkills={[]}
        cursorIndex={0}
        error="Select at least one skill."
      />
    );

    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Select at least one skill.");
    unmount();
  });

  test("renders empty state", () => {
    const { lastFrame, unmount } = render(
      <SkillSelectModal
        source="owner/repo"
        skills={[]}
        selectedSkills={[]}
        cursorIndex={0}
      />
    );

    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("No skills found in this source.");
    unmount();
  });
});
