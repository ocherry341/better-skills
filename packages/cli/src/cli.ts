#!/usr/bin/env node
import { Command } from "commander";
import { add } from "./commands/add.js";
import { ls } from "./commands/ls.js";
import { rm } from "./commands/rm.js";
import {
  profileCreate,
  profileLs,
  profileShow,
  profileUse,
} from "./commands/profile.js";
import { getActiveProfileName } from "./core/profile.js";
import {
  getProfilesPath,
  getActiveProfileFilePath,
  getGlobalSkillsPath,
  getStorePath,
} from "./utils/paths.js";

const program = new Command();

program
  .name("better-skills")
  .description("A pnpm-inspired skills management CLI with content-addressable storage")
  .version("0.1.0");

program
  .command("add <source>")
  .description("Add a skill from a source (github, git, or local path)")
  .option("-g, --global", "Install to global skills directory")
  .option("--copy", "Use file copy instead of hard links")
  .option("-n, --name <name>", "Override the skill name")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (source: string, opts) => {
    await add(source, {
      global: opts.global,
      copy: opts.copy,
      name: opts.name,
    });
  });

program
  .command("install <source>")
  .alias("i")
  .description("Add a skill from a source (github, git, or local path)")
  .option("-g, --global", "Install to global skills directory")
  .option("--copy", "Use file copy instead of hard links")
  .option("-n, --name <name>", "Override the skill name")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (source: string, opts) => {
    await add(source, {
      global: opts.global,
      copy: opts.copy,
      name: opts.name,
    });
  });

program
  .command("ls")
  .alias("list")
  .description("List installed skills")
  .option("-g, --global", "List global skills")
  .action(async (opts) => {
    await ls({ global: opts.global });
  });

program
  .command("rm <name>")
  .alias("remove")
  .description("Remove a skill")
  .option("-g, --global", "Remove from global skills directory")
  .action(async (name: string, opts) => {
    await rm(name, { global: opts.global });
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
      console.log("No profiles found. Create one with: better-skills profile create <name>");
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
      console.log(`${"  Name".padEnd(32)} ${"Hash".padEnd(12)} ${"Source"}`);
      console.log("  " + "-".repeat(68));
      for (const s of p.skills) {
        console.log(`  ${s.skillName.padEnd(30)} ${s.hash.slice(0, 8).padEnd(12)} ${s.source}`);
      }
    }
    console.log("");
  });

profile
  .command("use <name>")
  .description("Switch to a profile (re-links global skills)")
  .option("--copy", "Use file copy instead of hard links")
  .action(async (name: string, opts) => {
    await profileUse(name, {
      profilesDir: getProfilesPath(),
      activeFile: getActiveProfileFilePath(),
      skillsDir: getGlobalSkillsPath(),
      storePath: getStorePath(),
      copy: opts.copy,
    });
  });

program.parse();
