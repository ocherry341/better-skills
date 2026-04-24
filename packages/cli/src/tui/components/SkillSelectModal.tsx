import React from "react";
import { Box, Text } from "ink";
import { Modal } from "./Modal.js";

interface SkillSelectModalProps {
  source: string;
  skills: string[];
  selectedSkills: string[];
  cursorIndex: number;
  error?: string;
  maxVisible?: number;
}

function visibleWindow<T>(items: T[], cursorIndex: number, maxVisible: number): { start: number; items: T[] } {
  if (items.length <= maxVisible) return { start: 0, items };

  const half = Math.floor(maxVisible / 2);
  const maxStart = Math.max(0, items.length - maxVisible);
  const start = Math.max(0, Math.min(cursorIndex - half, maxStart));
  return { start, items: items.slice(start, start + maxVisible) };
}

export function SkillSelectModal({
  source,
  skills,
  selectedSkills,
  cursorIndex,
  error,
  maxVisible = 10,
}: SkillSelectModalProps) {
  const selected = new Set(selectedSkills);
  const { start, items } = visibleWindow(skills, cursorIndex, maxVisible);
  const rangeStart = skills.length === 0 ? 0 : start + 1;
  const rangeEnd = start + items.length;

  return (
    <Modal
      title={`Select skills from ${source}`}
      footer="j/k: navigate  Space: toggle  a: all  n: none  Enter: continue  Esc: back"
    >
      <Box flexDirection="column" marginTop={1}>
        {skills.length === 0 ? (
          <Text dimColor>No skills found in this source.</Text>
        ) : (
          items.map((skill, visibleIndex) => {
            const index = start + visibleIndex;
            const focused = index === cursorIndex;
            const checked = selected.has(skill);
            return (
              <Text key={skill} inverse={focused}>
                {focused ? "▸ " : "  "}[{checked ? "x" : " "}] {skill}
              </Text>
            );
          })
        )}
        <Text dimColor>
          {selectedSkills.length} selected · {rangeStart}-{rangeEnd} of {skills.length}
        </Text>
        {error ? <Text color="red">{error}</Text> : null}
      </Box>
    </Modal>
  );
}
