#!/usr/bin/env node
import { Command } from "commander";
import { add } from "./commands/add.js";
import { ls } from "./commands/ls.js";
import { rm } from "./commands/rm.js";

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

program.parse();
