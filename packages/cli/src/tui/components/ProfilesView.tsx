import React from "react";
import { Box, Text, useInput } from "ink";
import { List, type ListItem } from "./List.js";
import { DetailPane, type DetailField } from "./DetailPane.js";
import { StatusBar } from "./StatusBar.js";
import { Notification } from "./Notification.js";
import type { NotificationState } from "../hooks/useNotification.js";
import { useProfiles } from "../hooks/useProfiles.js";
import { type ActionMode } from "../App.js";

interface ProfilesViewProps {
  focusPane: "left" | "right";
  selectedIndex: number;
  refreshKey?: number;
  actionMode?: ActionMode;
  profileInput?: string;
  onSwitchProfile?: (profileName: string) => void;
  onCreateProfile?: () => void;
  onDeleteProfile?: (name: string) => void;
  onRenameProfile?: (name: string) => void;
  onCloneProfile?: (name: string) => void;
  onAddSkill?: (profileName: string) => void;
  onRemoveSkill?: (profileName: string) => void;
  notification?: NotificationState | null;
}

export function ProfilesView({
  focusPane,
  selectedIndex,
  refreshKey = 0,
  actionMode = null,
  profileInput = "",
  onSwitchProfile,
  onCreateProfile,
  onDeleteProfile,
  onRenameProfile,
  onCloneProfile,
  onAddSkill,
  onRemoveSkill,
  notification = null,
}: ProfilesViewProps) {
  const { profiles, loading } = useProfiles(refreshKey);

  const selected = profiles[selectedIndex];

  // Handle profile action keys (only when no modal is open)
  useInput((input, key) => {
    if (key.return && selected && onSwitchProfile) {
      onSwitchProfile(selected.name);
      return;
    }
    if (!selected && input !== "c") return;
    if (input === "c" && onCreateProfile) onCreateProfile();
    if (input === "d" && selected && onDeleteProfile) onDeleteProfile(selected.name);
    if (input === "r" && selected && onRenameProfile) onRenameProfile(selected.name);
    if (input === "C" && selected && onCloneProfile) onCloneProfile(selected.name);
    if (input === "a" && selected && onAddSkill) onAddSkill(selected.name);
    if (input === "x" && selected && onRemoveSkill) onRemoveSkill(selected.name);
  }, { isActive: actionMode === null });

  if (loading) return <Text>Loading profiles...</Text>;

  const items: ListItem[] = profiles.map((p) => ({
    key: p.name,
    label: p.name,
    markers: p.active ? "* active" : `${p.skillCount} skills`,
  }));

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
      {actionMode?.type === "profileCreate" && (
        <Box paddingX={1}>
          <Text>
            <Text bold color="green">New profile name: </Text>
            <Text>{profileInput}</Text>
            <Text dimColor>_</Text>
          </Text>
        </Box>
      )}
      {actionMode?.type === "profileDelete" && (
        <Box paddingX={1}>
          <Text bold color="red">Delete profile {actionMode.profileName}? (y/n)</Text>
        </Box>
      )}
      {actionMode?.type === "profileRename" && (
        <Box paddingX={1}>
          <Text>
            <Text bold color="blue">Rename {actionMode.profileName} to: </Text>
            <Text>{profileInput}</Text>
            <Text dimColor>_</Text>
          </Text>
        </Box>
      )}
      {actionMode?.type === "profileClone" && (
        <Box paddingX={1}>
          <Text>
            <Text bold color="blue">Clone {actionMode.profileName} as: </Text>
            <Text>{profileInput}</Text>
            <Text dimColor>_</Text>
          </Text>
        </Box>
      )}
      {actionMode?.type === "profileAddSkill" && (
        <Box paddingX={1}>
          <Text>
            <Text bold color="green">Add skill to {actionMode.profileName}: </Text>
            <Text>{profileInput}</Text>
            <Text dimColor>_</Text>
          </Text>
        </Box>
      )}
      {actionMode?.type === "profileRemoveSkill" && (
        <Box paddingX={1}>
          <Text>
            <Text bold color="red">Remove skill from {actionMode.profileName}: </Text>
            <Text>{profileInput}</Text>
            <Text dimColor>_</Text>
          </Text>
        </Box>
      )}
      <Box flexGrow={1}>
        <List items={items} selectedIndex={selectedIndex} title="Profiles" focused={focusPane === "left"} />
        <DetailPane fields={fields} content={skillList} contentTitle="Skills in profile" focused={focusPane === "right"} />
      </Box>
      <Notification notification={notification} />
      <StatusBar shortcuts={[
        { key: "Enter", label: "Switch" },
        { key: "c", label: "Create" },
        { key: "d", label: "Delete" },
        { key: "r", label: "Rename" },
        { key: "C", label: "Clone" },
        { key: "a", label: "Add skill" },
        { key: "x", label: "Rm skill" },
        { key: "?", label: "Help" },
        { key: "q", label: "Quit" },
      ]} />
    </Box>
  );
}
