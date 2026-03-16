import React from "react";
import { Box, Text, useInput } from "ink";
import { List, type ListItem } from "./List.js";
import { DetailPane, type DetailField } from "./DetailPane.js";
import { StatusBar, type Shortcut } from "./StatusBar.js";
import { useSkills, type SkillDetail } from "../hooks/useSkills.js";

type ActionMode =
  | null
  | { type: "search" }
  | { type: "confirmDelete"; skillName: string; isGlobal: boolean }
  | { type: "confirmMove"; skillName: string; isGlobal: boolean }
  | { type: "addInput" };

interface SkillsViewProps {
  focusPane: "left" | "right";
  selectedIndex: number;
  filterQuery?: string;
  searchMode?: boolean;
  actionMode?: ActionMode;
  onDelete?: (name: string, isGlobal: boolean) => void;
  onMove?: (name: string, isGlobal: boolean) => void;
  onAdd?: () => void;
  addSource?: string;
  refreshKey?: number;
}

export function SkillsView({
  focusPane,
  selectedIndex,
  filterQuery = "",
  searchMode = false,
  actionMode = null,
  onDelete,
  onMove,
  onAdd,
  addSource = "",
  refreshKey = 0,
}: SkillsViewProps) {
  const { skills, loading } = useSkills(refreshKey);

  const filteredSkills = filterQuery
    ? skills.filter((s) => s.name.toLowerCase().includes(filterQuery.toLowerCase()))
    : skills;

  const selected = filteredSkills[selectedIndex] as SkillDetail | undefined;

  // Handle d/m/a keys to trigger actions
  useInput((input) => {
    if (searchMode || actionMode !== null) return;

    if (input === "a" && onAdd) {
      onAdd();
      return;
    }
    if (!selected) return;
    if (input === "d" && onDelete) {
      onDelete(selected.name, selected.global);
    }
    if (input === "m" && onMove) {
      onMove(selected.name, selected.global);
    }
  }, { isActive: !searchMode && actionMode === null });

  if (loading) {
    return <Text>Loading skills...</Text>;
  }

  const items: ListItem[] = filteredSkills.map((s) => {
    const scope = [s.global ? "G" : "", s.project ? "P" : ""]
      .filter(Boolean)
      .join(" ");
    return { key: s.name, label: s.name, markers: scope };
  });

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
    { key: "q", label: "Quit" },
  ];

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      {searchMode && (
        <Box paddingX={1}>
          <Text>
            <Text bold color="yellow">/</Text>
            <Text>{filterQuery}</Text>
            <Text dimColor>_</Text>
          </Text>
        </Box>
      )}
      {!searchMode && filterQuery && (
        <Box paddingX={1}>
          <Text dimColor>filter: {filterQuery} ({filteredSkills.length} match{filteredSkills.length !== 1 ? "es" : ""})</Text>
        </Box>
      )}
      {actionMode?.type === "confirmDelete" && (
        <Box paddingX={1}>
          <Text bold color="red">Delete {actionMode.skillName}? (y/n)</Text>
        </Box>
      )}
      {actionMode?.type === "confirmMove" && (
        <Box paddingX={1}>
          <Text bold color="blue">Move {actionMode.skillName} to (g)lobal or (p)roject?  Esc to cancel</Text>
        </Box>
      )}
      {actionMode?.type === "addInput" && (
        <Box paddingX={1}>
          <Text>
            <Text bold color="green">Add source: </Text>
            <Text>{addSource}</Text>
            <Text dimColor>_</Text>
          </Text>
        </Box>
      )}
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

export type { ActionMode };
