import { beforeEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import { mkdir, readdir, writeFile } from "fs/promises";
import { join } from "path";
import { add, listAddableSkills } from "../src/commands/add.js";
import {
  PROJECT_SKILLS_SUBDIR,
  cleanTestHome,
  getProjectSkillsPath,
  getStorePath,
  home,
} from "../src/utils/paths.js";

const cli = join(import.meta.dir, "../src/cli.ts");

async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
  const original = console.log;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => {
    logs.push(args.join(" "));
  };

  try {
    await fn();
  } finally {
    console.log = original;
  }

  return logs;
}

async function runCli(args: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(["bun", "run", cli, ...args], {
    cwd,
    env: {
      ...process.env,
      HOME: home(),
      NODE_ENV: "development",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`CLI failed (${exitCode})\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }
}

async function createSkill(root: string, dirName: string, skillName: string): Promise<void> {
  const dir = join(root, dirName);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${skillName}\ndescription: Test skill ${skillName}\n---\n# ${skillName}\n`
  );
}

async function createMultiSkillSource(): Promise<string> {
  const source = join(home(), "multi-skill-source");
  await createSkill(source, "skill-one", "skill-one");
  await createSkill(source, "skill-two", "skill-two");
  await createSkill(source, "convex", "Convex Best Practices");
  return source;
}

async function installedSkillNames(skillsPath = getProjectSkillsPath()): Promise<string[]> {
  if (!skillsPath) throw new Error("Expected test project skills path");
  try {
    return (await readdir(skillsPath)).sort();
  } catch {
    return [];
  }
}

describe("add --skill option", () => {
  beforeEach(async () => {
    await cleanTestHome();
  });

  test("listAddableSkills returns sorted discovered skill names", async () => {
    const source = await createMultiSkillSource();

    await expect(listAddableSkills(source)).resolves.toEqual([
      "Convex Best Practices",
      "skill-one",
      "skill-two",
    ]);
  });

  test("listAddableSkills returns empty array for source without SKILL.md", async () => {
    const source = join(home(), "not-a-skill-source-for-list");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "README.md"), "# Not a skill\n");

    await expect(listAddableSkills(source)).resolves.toEqual([]);
  });

  test("listAddableSkills ignores invalid SKILL.md candidates", async () => {
    const source = await createMultiSkillSource();
    const malformedDir = join(source, "malformed");
    await mkdir(malformedDir, { recursive: true });
    await writeFile(join(malformedDir, "SKILL.md"), "---\ndescription: Broken\n---\n# Broken\n");

    await expect(listAddableSkills(source)).resolves.toEqual([
      "Convex Best Practices",
      "skill-one",
      "skill-two",
    ]);
  });

  test("single skill selection installs only the named skill", async () => {
    const source = await createMultiSkillSource();

    await add(source, { skill: ["skill-one"] });

    expect(await installedSkillNames()).toEqual(["skill-one"]);
  });

  test("multiple skill selection installs all requested named skills", async () => {
    const source = await createMultiSkillSource();

    await add(source, { skill: ["skill-one", "skill-two"] });

    expect(await installedSkillNames()).toEqual(["skill-one", "skill-two"]);
  });

  test("wildcard selection installs all discovered skills", async () => {
    const source = await createMultiSkillSource();

    await add(source, { skill: ["*"] });

    expect(await installedSkillNames()).toEqual([
      "Convex Best Practices",
      "skill-one",
      "skill-two",
    ]);
  });

  test("matching is case-insensitive", async () => {
    const source = await createMultiSkillSource();

    await add(source, { skill: ["SKILL-ONE"] });

    expect(await installedSkillNames()).toEqual(["skill-one"]);
  });

  test("no match rejects with sorted available skills and installs nothing", async () => {
    const source = await createMultiSkillSource();

    await expect(add(source, { skill: ["missing"] })).rejects.toThrow(
      "No matching skills found for: missing\nAvailable skills:\n  - Convex Best Practices\n  - skill-one\n  - skill-two"
    );
    expect(await installedSkillNames()).toEqual([]);
  });

  test("multi-word exact matching installs matching skill", async () => {
    const source = await createMultiSkillSource();

    await add(source, { skill: ["Convex Best Practices"] });

    expect(await installedSkillNames()).toEqual(["Convex Best Practices"]);
  });

  test("partial matching does not match", async () => {
    const source = await createMultiSkillSource();

    await expect(add(source, { skill: ["Convex"] })).rejects.toThrow(
      "No matching skills found for: Convex"
    );
    expect(await installedSkillNames()).toEqual([]);
  });

  test("--name works with one selected skill", async () => {
    const source = await createMultiSkillSource();

    await add(source, { skill: ["skill-one"], name: "custom-name" });

    expect(await installedSkillNames()).toEqual(["custom-name"]);
    expect(await readdir(getStorePath())).toHaveLength(1);
  });

  test("--name fails with multiple selected skills", async () => {
    const source = await createMultiSkillSource();

    await expect(
      add(source, { skill: ["skill-one", "skill-two"], name: "custom-name" })
    ).rejects.toThrow("--name can only be used when installing a single skill.");
    expect(await installedSkillNames()).toEqual([]);
  });

  test("--name fails with wildcard skill selection", async () => {
    const source = await createMultiSkillSource();

    await expect(add(source, { skill: ["*"], name: "custom-name" })).rejects.toThrow(
      "--name can only be used when installing a single skill."
    );
    expect(await installedSkillNames()).toEqual([]);
  });

  test("source with no SKILL.md and --skill prints no-skills message instead of fake available skills", async () => {
    const source = join(home(), "not-a-skill-source");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "README.md"), "# Not a skill\n");

    const logs = await captureLogs(() => add(source, { skill: ["missing"] }));

    expect(logs).toContain("No skills found (no SKILL.md files detected).");
    expect(logs.join("\n")).not.toContain("Available skills:");
    expect(await installedSkillNames()).toEqual([]);
  });

  test("add command supports --skill behavior", async () => {
    const source = await createMultiSkillSource();
    const project = join(home(), "cli-add-project");
    await mkdir(project, { recursive: true });

    await runCli(["add", source, "--skill", "skill-one"], project);

    expect(await installedSkillNames(join(project, PROJECT_SKILLS_SUBDIR))).toEqual(["skill-one"]);
  });

  test("install command supports --skill behavior", async () => {
    const source = await createMultiSkillSource();
    const project = join(home(), "cli-install-project");
    await mkdir(project, { recursive: true });

    await runCli(["install", source, "--skill", "skill-one"], project);

    expect(await installedSkillNames(join(project, PROJECT_SKILLS_SUBDIR))).toEqual(["skill-one"]);
  });

  test("i alias supports --skill behavior", async () => {
    const source = await createMultiSkillSource();
    const project = join(home(), "cli-i-project");
    await mkdir(project, { recursive: true });

    await runCli(["i", source, "--skill", "skill-two"], project);

    expect(await installedSkillNames(join(project, PROJECT_SKILLS_SUBDIR))).toEqual(["skill-two"]);
  });

  test("install command parses multiple --skill values", async () => {
    const source = await createMultiSkillSource();
    const project = join(home(), "cli-install-multiple-project");
    await mkdir(project, { recursive: true });

    await runCli(["install", source, "--skill", "skill-one", "skill-two"], project);

    expect(await installedSkillNames(join(project, PROJECT_SKILLS_SUBDIR))).toEqual([
      "skill-one",
      "skill-two",
    ]);
  });

  test("install command parses a multi-word --skill value", async () => {
    const source = await createMultiSkillSource();
    const project = join(home(), "cli-install-multi-word-project");
    await mkdir(project, { recursive: true });

    await runCli(["install", source, "--skill", "Convex Best Practices"], project);

    expect(await installedSkillNames(join(project, PROJECT_SKILLS_SUBDIR))).toEqual([
      "Convex Best Practices",
    ]);
  });

  test("install help exposes --skill option", async () => {
    const addHelp = await $`bun run ${cli} add --help`.text();
    const installHelp = await $`bun run ${cli} install --help`.text();
    const aliasHelp = await $`bun run ${cli} i --help`.text();

    expect(addHelp).toContain("-s, --skill <skills...>");
    expect(installHelp).toContain("-s, --skill <skills...>");
    expect(aliasHelp).toContain("-s, --skill <skills...>");
  });
});
