import React, { useState, useCallback } from "react";
import { Box, useApp, useInput } from "ink";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { TabBar, TABS, type TabName } from "./components/TabBar.js";
import { SkillsView } from "./components/SkillsView.js";
import { ProfilesView } from "./components/ProfilesView.js";
import { StoreView } from "./components/StoreView.js";
import { ClientsView } from "./components/ClientsView.js";
import {
  getProfilesPath,
  getActiveProfileFilePath,
  getGlobalSkillsPath,
  getStorePath,
  getConfigPath,
  getRegistryPath,
} from "../utils/paths.js";

export type ActionMode =
  | null
  | { type: "search" }
  | { type: "confirmDelete"; skillName: string; isGlobal: boolean }
  | { type: "confirmMove"; skillName: string; isGlobal: boolean }
  | { type: "addInput" }
  | { type: "profileCreate" }
  | { type: "profileDelete"; profileName: string }
  | { type: "profileRename"; profileName: string }
  | { type: "profileClone"; profileName: string }
  | { type: "profileAddSkill"; profileName: string }
  | { type: "profileRemoveSkill"; profileName: string };

interface AppProps {
  version: string;
}

export function App({ version }: AppProps) {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState<TabName>("Skills");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusPane, setFocusPane] = useState<"left" | "right">("left");
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [addSource, setAddSource] = useState("");
  const [profileInput, setProfileInput] = useState("");

  const isModal = actionMode !== null;
  const isSearch = actionMode?.type === "search";

  const switchTab = useCallback((tab: TabName) => {
    setActiveTab(tab);
    setSelectedIndex(0);
    setFocusPane("left");
    setActionMode(null);
    setSearchQuery("");
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Modal input handler (search, confirmDelete, confirmMove)
  useInput((input, key) => {
    if (!isModal) return;

    if (actionMode.type === "search") {
      if (key.escape) {
        setActionMode(null);
        setSearchQuery("");
        setSelectedIndex(0);
        return;
      }
      if (key.return) {
        setActionMode(null);
        return;
      }
      if (key.backspace || key.delete) {
        setSearchQuery((q) => q.slice(0, -1));
        setSelectedIndex(0);
        return;
      }
      if (input.length === 1 && !key.ctrl && !key.meta) {
        setSearchQuery((q) => q + input);
        setSelectedIndex(0);
      }
      return;
    }

    if (actionMode.type === "confirmDelete") {
      if (input === "y" || input === "Y") {
        (async () => {
          const { rm } = await import("../commands/rm.js");
          await rm(actionMode.skillName, { global: actionMode.isGlobal });
          setActionMode(null);
          setSelectedIndex(0);
          refresh();
        })();
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        setActionMode(null);
      }
      return;
    }

    if (actionMode.type === "confirmMove") {
      if (input === "g" || input === "G") {
        (async () => {
          const { mvToGlobal } = await import("../commands/mv.js");
          await mvToGlobal(actionMode.skillName, {});
          setActionMode(null);
          setSelectedIndex(0);
          refresh();
        })();
        return;
      }
      if (input === "p" || input === "P") {
        (async () => {
          const { mvToProject } = await import("../commands/mv.js");
          await mvToProject(actionMode.skillName, {});
          setActionMode(null);
          setSelectedIndex(0);
          refresh();
        })();
        return;
      }
      if (key.escape) {
        setActionMode(null);
      }
      return;
    }

    if (actionMode.type === "addInput") {
      if (key.escape) {
        setActionMode(null);
        setAddSource("");
        return;
      }
      if (key.return && addSource.trim()) {
        const source = addSource.trim();
        setActionMode(null);
        setAddSource("");
        (async () => {
          const { add } = await import("../commands/add.js");
          await add(source, { global: true });
          setSelectedIndex(0);
          refresh();
        })();
        return;
      }
      if (key.backspace || key.delete) {
        setAddSource((s) => s.slice(0, -1));
        return;
      }
      if (input.length === 1 && !key.ctrl && !key.meta) {
        setAddSource((s) => s + input);
      }
      return;
    }

    // Profile text-input modals: create, rename, clone, addSkill, removeSkill
    if (
      actionMode.type === "profileCreate" ||
      actionMode.type === "profileRename" ||
      actionMode.type === "profileClone" ||
      actionMode.type === "profileAddSkill" ||
      actionMode.type === "profileRemoveSkill"
    ) {
      if (key.escape) {
        setActionMode(null);
        setProfileInput("");
        return;
      }
      if (key.return && profileInput.trim()) {
        const value = profileInput.trim();
        const mode = actionMode;
        setActionMode(null);
        setProfileInput("");
        (async () => {
          const {
            profileCreate: createProfile,
            profileRename: renameProfile,
            profileClone: cloneProfile,
            profileAdd: addToProfile,
            profileRm: rmFromProfile,
          } = await import("../commands/profile.js");
          const profilesDir = getProfilesPath();
          const activeFile = getActiveProfileFilePath();
          const skillsDir = getGlobalSkillsPath();
          if (mode.type === "profileCreate") {
            await createProfile(value, {
              profilesDir,
              activeFile,
              skillsDir,
            });
          } else if (mode.type === "profileRename") {
            await renameProfile(mode.profileName, value, {
              profilesDir,
              activeFile,
            });
          } else if (mode.type === "profileClone") {
            await cloneProfile(mode.profileName, value, {
              profilesDir,
            });
          } else if (mode.type === "profileAddSkill") {
            await addToProfile(value, {
              profilesDir,
              activeFile,
              skillsDir,
              storePath: getStorePath(),
              profileName: mode.profileName,
              registryPath: getRegistryPath(),
              configPath: getConfigPath(),
            });
          } else if (mode.type === "profileRemoveSkill") {
            await rmFromProfile(value, {
              profilesDir,
              activeFile,
              skillsDir,
              profileName: mode.profileName,
              registryPath: getRegistryPath(),
              configPath: getConfigPath(),
            });
          }
          setSelectedIndex(0);
          refresh();
        })();
        return;
      }
      if (key.backspace || key.delete) {
        setProfileInput((s) => s.slice(0, -1));
        return;
      }
      if (input.length === 1 && !key.ctrl && !key.meta) {
        setProfileInput((s) => s + input);
      }
      return;
    }

    // Profile confirm modal: delete
    if (actionMode.type === "profileDelete") {
      if (input === "y" || input === "Y") {
        const name = actionMode.profileName;
        setActionMode(null);
        (async () => {
          const { profileDelete: deleteProfile } = await import("../commands/profile.js");
          await deleteProfile(name, {
            profilesDir: getProfilesPath(),
            activeFile: getActiveProfileFilePath(),
          });
          setSelectedIndex(0);
          refresh();
        })();
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        setActionMode(null);
      }
      return;
    }
  }, { isActive: isModal });

  useKeyboard({
    onQuit: () => { if (!isModal) exit(); },
    onUp: () => { if (!isModal) setSelectedIndex((i) => Math.max(0, i - 1)); },
    onDown: () => { if (!isModal) setSelectedIndex((i) => i + 1); },
    onLeft: () => { if (!isModal) setFocusPane("left"); },
    onRight: () => { if (!isModal) setFocusPane("right"); },
    onTab: () => {
      if (isModal) return;
      const idx = TABS.indexOf(activeTab);
      switchTab(TABS[(idx + 1) % TABS.length]);
    },
    onKey: (key) => {
      if (isModal) return;
      const num = parseInt(key, 10);
      if (num >= 1 && num <= 4) {
        switchTab(TABS[num - 1]);
        return;
      }
      if (activeTab === "Skills") {
        if (key === "/") {
          setActionMode({ type: "search" });
          setSearchQuery("");
          setSelectedIndex(0);
        }
      }
    },
  });

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <TabBar active={activeTab} version={version} />
      {activeTab === "Skills" && (
        <SkillsView
          selectedIndex={selectedIndex}
          focusPane={focusPane}
          filterQuery={searchQuery}
          searchMode={isSearch}
          actionMode={actionMode}
          onDelete={(name, isGlobal) => setActionMode({ type: "confirmDelete", skillName: name, isGlobal })}
          onMove={(name, isGlobal) => setActionMode({ type: "confirmMove", skillName: name, isGlobal })}
          onAdd={() => { setActionMode({ type: "addInput" }); setAddSource(""); }}
          addSource={addSource}
          refreshKey={refreshKey}
        />
      )}
      {activeTab === "Profiles" && (
        <ProfilesView
          selectedIndex={selectedIndex}
          focusPane={focusPane}
          refreshKey={refreshKey}
          actionMode={actionMode}
          profileInput={profileInput}
          onSwitchProfile={(name) => {
            (async () => {
              const { profileUse } = await import("../commands/profile.js");
              await profileUse(name, {
                profilesDir: getProfilesPath(),
                activeFile: getActiveProfileFilePath(),
                skillsDir: getGlobalSkillsPath(),
                storePath: getStorePath(),
                registryPath: getRegistryPath(),
                configPath: getConfigPath(),
              });
              refresh();
            })();
          }}
          onCreateProfile={() => { setActionMode({ type: "profileCreate" }); setProfileInput(""); }}
          onDeleteProfile={(name) => setActionMode({ type: "profileDelete", profileName: name })}
          onRenameProfile={(name) => { setActionMode({ type: "profileRename", profileName: name }); setProfileInput(""); }}
          onCloneProfile={(name) => { setActionMode({ type: "profileClone", profileName: name }); setProfileInput(""); }}
          onAddSkill={(name) => { setActionMode({ type: "profileAddSkill", profileName: name }); setProfileInput(""); }}
          onRemoveSkill={(name) => { setActionMode({ type: "profileRemoveSkill", profileName: name }); setProfileInput(""); }}
        />
      )}
      {activeTab === "Store" && (
        <StoreView selectedIndex={selectedIndex} />
      )}
      {activeTab === "Clients" && (
        <ClientsView
          selectedIndex={selectedIndex}
          refreshKey={refreshKey}
          onEnableClient={(clientId) => {
            (async () => {
              const { clientAdd } = await import("../commands/client.js");
              const { getConfigPath, getRegistryPath, getStorePath, getGlobalSkillsPath } = await import("../utils/paths.js");
              await clientAdd([clientId], {
                configPath: getConfigPath(),
                registryPath: getRegistryPath(),
                storePath: getStorePath(),
                skillsDir: getGlobalSkillsPath(),
              });
              refresh();
            })();
          }}
          onDisableClient={(clientId) => {
            (async () => {
              const { clientRm } = await import("../commands/client.js");
              const { getConfigPath, getRegistryPath, getGlobalSkillsPath } = await import("../utils/paths.js");
              await clientRm([clientId], {
                configPath: getConfigPath(),
                registryPath: getRegistryPath(),
                skillsDir: getGlobalSkillsPath(),
              });
              refresh();
            })();
          }}
        />
      )}
    </Box>
  );
}
