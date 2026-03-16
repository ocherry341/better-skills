import React from "react";
import { Box, Text } from "ink";
import { List, type ListItem } from "./List.js";
import { DetailPane, type DetailField } from "./DetailPane.js";
import { StatusBar } from "./StatusBar.js";
import { useProfiles } from "../hooks/useProfiles.js";

interface ProfilesViewProps {
  focusPane: "left" | "right";
  selectedIndex: number;
}

export function ProfilesView({ focusPane, selectedIndex }: ProfilesViewProps) {
  const { profiles, loading } = useProfiles();

  if (loading) return <Text>Loading profiles...</Text>;

  const items: ListItem[] = profiles.map((p) => ({
    key: p.name,
    label: p.name,
    markers: p.active ? "* active" : `${p.skillCount} skills`,
  }));

  const selected = profiles[selectedIndex];
  const fields: DetailField[] = selected
    ? [
        { label: "Name", value: selected.name },
        { label: "Status", value: selected.active ? "Active" : "Inactive" },
        { label: "Skills", value: String(selected.skillCount) },
      ]
    : [];

  const skillList = selected
    ? selected.skills.map((s) => `  ${s.skillName} v${s.v} (${s.source})`).join("\n")
    : "";

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      <Box flexGrow={1}>
        <List items={items} selectedIndex={selectedIndex} title="Profiles" focused={focusPane === "left"} />
        <DetailPane fields={fields} content={skillList} contentTitle="Skills in profile" focused={focusPane === "right"} />
      </Box>
      <StatusBar shortcuts={[
        { key: "Enter", label: "Switch" },
        { key: "?", label: "Help" },
        { key: "q", label: "Quit" },
      ]} />
    </Box>
  );
}
