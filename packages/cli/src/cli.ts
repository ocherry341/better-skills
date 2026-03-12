#!/usr/bin/env node
import { Command } from "commander";

declare const __BSK_VERSION__: string | undefined;
const version =
  typeof __BSK_VERSION__ !== "undefined"
    ? __BSK_VERSION__
    : "0.0.0-dev";
import { add } from "./commands/add.js";
import { clientAdd, clientRm, clientLs } from "./commands/client.js";
import { rm } from "./commands/rm.js";
import { ls, printLs, lsAll, printLsAll } from "./commands/ls.js";
import { save } from "./commands/save.js";
import { storeVerify } from "./commands/store-cmd.js";
import {
  profileCreate,
  profileLs,
  profileShow,
  profileUse,
  profileAdd,
  profileRm,
  profileDelete,
  profileRename,
  profileClone,
} from "./commands/profile.js";
import { getActiveProfileName } from "./core/profile.js";
import {
  getProfilesPath,
  getActiveProfileFilePath,
  getGlobalSkillsPath,
  getStorePath,
  getConfigPath,
  getRegistryPath,
} from "./utils/paths.js";

const program = new Command();

program
  .name("bsk")
  .description("A pnpm-inspired skills management CLI with content-addressable storage")
  .version(version);

program
  .command("add <source>")
  .description("Add a skill from a source (github, git, or local path)")
  .option("-g, --global", "Install to global skills directory")
  .option("--hardlink", "Use hard links instead of file copy")
  .option("-n, --name <name>", "Override the skill name")
  .option("-f, --force", "Overwrite unmanaged skills")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("--clients <clients>", "Link to specific clients only (comma-separated)")
  .option("--no-clients", "Skip linking to client directories")
  .action(async (source: string, opts) => {
    await add(source, {
      global: opts.global,
      hardlink: opts.hardlink,
      name: opts.name,
      force: opts.force,
      clients: typeof opts.clients === "string" ? opts.clients.split(",") : undefined,
      noClients: opts.clients === false,
    });
  });

program
  .command("install <source>")
  .alias("i")
  .description("Add a skill from a source (github, git, or local path)")
  .option("-g, --global", "Install to global skills directory")
  .option("--hardlink", "Use hard links instead of file copy")
  .option("-n, --name <name>", "Override the skill name")
  .option("-f, --force", "Overwrite unmanaged skills")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("--clients <clients>", "Link to specific clients only (comma-separated)")
  .option("--no-clients", "Skip linking to client directories")
  .action(async (source: string, opts) => {
    await add(source, {
      global: opts.global,
      hardlink: opts.hardlink,
      name: opts.name,
      force: opts.force,
      clients: typeof opts.clients === "string" ? opts.clients.split(",") : undefined,
      noClients: opts.clients === false,
    });
  });

program
  .command("rm <name>")
  .alias("remove")
  .description("Remove a skill")
  .option("-g, --global", "Remove from global skills directory")
  .action(async (name: string, opts) => {
    await rm(name, { global: opts.global });
  });

program
  .command("list")
  .alias("ls")
  .description("Show all active skills with their source (global / project)")
  .option("-a, --all", "List all skills managed by bsk (from registry)")
  .action(async (opts) => {
    if (opts.all) {
      const entries = await lsAll();
      printLsAll(entries);
    } else {
      const entries = await ls();
      printLs(entries);
    }
  });

program
  .command("save [skill-name]")
  .description("Save new or changed skills to bsk management")
  .action(async (skillName?: string) => {
    await save({ skillName });
  });

program
  .command("migrate")
  .description("Alias for 'save' — migrate unmanaged skills to bsk management")
  .action(async () => {
    await save();
  });

const client = program
  .command("client")
  .description("Manage multi-client skill directories");

client
  .command("add <clients...>")
  .description("Enable client(s) for skill syncing")
  .action(async (clients: string[]) => {
    await clientAdd(clients, {
      configPath: getConfigPath(),
      registryPath: getRegistryPath(),
      storePath: getStorePath(),
      skillsDir: getGlobalSkillsPath(),
      projectRoot: process.cwd(),
    });
  });

client
  .command("rm <clients...>")
  .alias("remove")
  .description("Disable client(s) and remove linked skills")
  .action(async (clients: string[]) => {
    await clientRm(clients, {
      configPath: getConfigPath(),
      registryPath: getRegistryPath(),
      skillsDir: getGlobalSkillsPath(),
      projectRoot: process.cwd(),
    });
  });

client
  .command("ls")
  .alias("list")
  .description("Show all supported clients and their status")
  .action(async () => {
    const items = await clientLs({ configPath: getConfigPath() });
    console.log("");
    console.log("  agents".padEnd(14) + getGlobalSkillsPath().padEnd(38) + "(always enabled)");
    for (const item of items) {
      const marker = item.enabled ? "* " : "  ";
      console.log(marker + item.id.padEnd(12) + item.path);
    }
    console.log("");
  });

const profile = program
  .command("profile")
  .description("Manage skill profiles");

profile
  .command("create <name>")
  .description("Create a new profile")
  .option("--from-existing", "Snapshot current global skills into the profile")
  .action(async (name: string, opts) => {
    await profileCreate(name, {
      profilesDir: getProfilesPath(),
      activeFile: getActiveProfileFilePath(),
      skillsDir: getGlobalSkillsPath(),
      fromExisting: opts.fromExisting,
    });
  });

profile
  .command("ls")
  .alias("list")
  .description("List all profiles")
  .action(async () => {
    const items = await profileLs({
      profilesDir: getProfilesPath(),
      activeFile: getActiveProfileFilePath(),
    });
    if (items.length === 0) {
      console.log("No profiles found. Create one with: bsk profile create <name>");
      return;
    }
    console.log("");
    for (const item of items) {
      const marker = item.active ? " (active)" : "";
      console.log(`  ${item.name}${marker}`);
    }
    console.log("");
  });

profile
  .command("show [name]")
  .description("Show skills in a profile (defaults to active profile)")
  .action(async (name?: string) => {
    const profilesDir = getProfilesPath();
    const activeFile = getActiveProfileFilePath();
    const targetName = name ?? await getActiveProfileName(activeFile);
    if (!targetName) {
      console.error("No active profile. Specify a name or create one first.");
      process.exit(1);
    }
    const p = await profileShow(targetName, { profilesDir });
    console.log(`\nProfile: ${p.name} (${p.skills.length} skills)\n`);
    if (p.skills.length === 0) {
      console.log("  (empty)");
    } else {
      console.log(`${"  Name".padEnd(32)} ${"Version".padEnd(10)} ${"Source"}`);
      console.log("  " + "-".repeat(60));
      for (const s of p.skills) {
        console.log(`  ${s.skillName.padEnd(30)} ${"v" + s.v.toString().padEnd(9)} ${s.source}`);
      }
    }
    console.log("");
  });

profile
  .command("use <name>")
  .description("Switch to a profile (re-links global skills)")
  .option("--hardlink", "Use hard links instead of file copy")
  .action(async (name: string, opts) => {
    await profileUse(name, {
      profilesDir: getProfilesPath(),
      activeFile: getActiveProfileFilePath(),
      skillsDir: getGlobalSkillsPath(),
      storePath: getStorePath(),
      hardlink: opts.hardlink,
      configPath: getConfigPath(),
    });
  });

profile
  .command("add <source>")
  .description("Add a skill to a profile")
  .option("-p, --profile <name>", "Target profile (defaults to active)")
  .option("--hardlink", "Use hard links instead of file copy")
  .option("-n, --name <name>", "Override the skill name")
  .action(async (source: string, opts) => {
    await profileAdd(source, {
      profilesDir: getProfilesPath(),
      activeFile: getActiveProfileFilePath(),
      skillsDir: getGlobalSkillsPath(),
      storePath: getStorePath(),
      profileName: opts.profile,
      hardlink: opts.hardlink,
      name: opts.name,
      configPath: getConfigPath(),
    });
  });

profile
  .command("rm <skill-name>")
  .alias("remove")
  .description("Remove a skill from a profile")
  .option("-p, --profile <name>", "Target profile (defaults to active)")
  .action(async (skillName: string, opts) => {
    await profileRm(skillName, {
      profilesDir: getProfilesPath(),
      activeFile: getActiveProfileFilePath(),
      skillsDir: getGlobalSkillsPath(),
      profileName: opts.profile,
      configPath: getConfigPath(),
    });
  });

profile
  .command("delete [name]")
  .description("Delete a profile (cannot delete active profile)")
  .option("-p, --profile <name>", "Profile to delete")
  .action(async (name: string | undefined, opts) => {
    const target = opts.profile ?? name;
    if (!target) {
      console.error("Specify a profile name: bsk profile delete <name>");
      process.exit(1);
    }
    await profileDelete(target, {
      profilesDir: getProfilesPath(),
      activeFile: getActiveProfileFilePath(),
    });
  });

profile
  .command("rename [old] [new]")
  .description("Rename a profile")
  .option("-p, --profile <name>", "Profile to rename")
  .action(async (old: string | undefined, newName: string | undefined, opts) => {
    let oldName: string;
    let targetName: string;
    if (opts.profile) {
      oldName = opts.profile;
      targetName = old!;
    } else {
      oldName = old!;
      targetName = newName!;
    }
    if (!oldName || !targetName) {
      console.error("Usage: bsk profile rename <old> <new>");
      process.exit(1);
    }
    await profileRename(oldName, targetName, {
      profilesDir: getProfilesPath(),
      activeFile: getActiveProfileFilePath(),
    });
  });

profile
  .command("clone [source] [target]")
  .description("Clone a profile as a new profile")
  .option("-p, --profile <name>", "Source profile to clone")
  .action(async (source: string | undefined, target: string | undefined, opts) => {
    let sourceName: string;
    let targetName: string;
    if (opts.profile) {
      sourceName = opts.profile;
      targetName = source!;
    } else {
      sourceName = source!;
      targetName = target!;
    }
    if (!sourceName || !targetName) {
      console.error("Usage: bsk profile clone <source> <target>");
      process.exit(1);
    }
    await profileClone(sourceName, targetName, {
      profilesDir: getProfilesPath(),
    });
  });

const storeCmd = program
  .command("store")
  .description("Manage the content-addressable store");

storeCmd
  .command("verify")
  .description("Check integrity of all store entries")
  .action(async () => {
    const result = await storeVerify();
    console.log(`\nStore: ${result.total} entries, ${result.ok} ok, ${result.corrupted.length} corrupted`);
    if (result.corrupted.length > 0) {
      console.log("");
      for (const entry of result.corrupted) {
        const skills = entry.skills.length > 0 ? ` (${entry.skills.join(", ")})` : "";
        console.log(`  ✗ ${entry.hash.slice(0, 8)}${skills}`);
      }
      console.log("\nRe-add affected skills to repair: bsk add <source> --force");
    }
    console.log("");
  });

program.parseAsync().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
