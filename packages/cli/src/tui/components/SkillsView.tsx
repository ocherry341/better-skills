import React from "react";
import { Box, Text } from "ink";
import { List, type ListItem } from "./List.js";
import { DetailPane, type DetailField } from "./DetailPane.js";
import { StatusBar, type Shortcut } from "./StatusBar.js";
import { useSkills } from "../hooks/useSkills.js";

interface SkillsViewProps {
  focusPane: "left" | "right";
  selectedIndex: number;
}

export function SkillsView({ focusPane, selectedIndex }: SkillsViewProps) {
  const { skills, loading } = useSkills();

  if (loading) {
    return <Text>Loading skills...</Text>;
  }

  const items: ListItem[] = skills.map((s) => {
    const scope = [s.global ? "G" : "", s.project ? "P" : ""]
      .filter(Boolean)
      .join(" ");
    return { key: s.name, label: s.name, markers: scope };
  });

  const selected = skills[selectedIndex];
  const fields: DetailField[] = selected
    ? [
        { label: "Name", value: selected.name },
        { label: "Scope", value: [selected.global ? "Global" : "", selected.project ? "Project" : ""].filter(Boolean).join(" + ") },
        ...(selected.source ? [{ label: "Source", value: selected.source }] : []),
        ...(selected.version != null ? [{ label: "Version", value: `v${selected.version}` }] : []),
        ...(selected.hash ? [{ label: "Hash", value: selected.hash.slice(0, 8) }] : []),
        ...(selected.addedAt ? [{ label: "Added", value: selected.addedAt.split("T")[0] }] : []),
      ]
    : [];

  const shortcuts: Shortcut[] = [
    { key: "a", label: "Add" },
    { key: "d", label: "Delete" },
    { key: "m", label: "Move" },
    { key: "/", label: "Search" },
    { key: "?", label: "Help" },
    { key: "q", label: "Quit" },
  ];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexGrow={1}>
        <List
          items={items}
          selectedIndex={selectedIndex}
          title="Skills"
          focused={focusPane === "left"}
        />
        <DetailPane
          fields={fields}
          content={selected?.skillMdContent}
          contentTitle="SKILL.md"
          focused={focusPane === "right"}
        />
      </Box>
      <StatusBar shortcuts={shortcuts} />
    </Box>
  );
}
