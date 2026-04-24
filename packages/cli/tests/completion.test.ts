import { beforeEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { buildProgram } from "../src/cli.js";
import { profileCreate } from "../src/commands/profile.js";
import { complete } from "../src/completion/engine.js";
import { formatCompletionItems } from "../src/completion/format.js";
import { completionMetadata } from "../src/completion/metadata.js";
import { completeFromProvider } from "../src/completion/providers.js";
import { getCompletionScript, parseShell } from "../src/completion/shells.js";
import { supportedShells } from "../src/completion/types.js";
import { VALID_CLIENT_IDS } from "../src/core/clients.js";
import { type Profile, writeProfile } from "../src/core/profile.js";
import { cleanTestHome, getGlobalSkillsPath, getProfilePath, home } from "../src/utils/paths.js";

const cli = join(import.meta.dir, "../src/cli.ts");

describe("completion metadata", () => {
  test("supports bash zsh and fish", () => {
    expect(supportedShells).toEqual(["bash", "zsh", "fish"]);
  });

  test("defines enum completions for completion shell and mv target", () => {
    expect(completionMetadata["completion"]?.args?.[0]).toEqual({ values: ["bash", "zsh", "fish"] });
    expect(completionMetadata["mv"]?.args?.[1]).toEqual({ values: ["global", "project"] });
  });

  test("delegates sync import file completion to the shell", () => {
    expect(completionMetadata["sync import"]?.args?.[0]).toEqual({ file: true });
  });

  test("defines profile option completions and existing profile apply completion", () => {
    expect(completionMetadata["profile apply"]?.args?.[0]).toEqual({ provider: "profiles" });
    expect(completionMetadata["profile rm"]?.args?.[0]).toEqual({ provider: "profileSkills" });
    expect(completionMetadata["profile rm"]?.options?.["--profile"]).toEqual({ provider: "profiles" });
  });
});

describe("completion providers", () => {
  beforeEach(async () => {
    await cleanTestHome();
  });

  test("activeSkills returns installed skills including spaces", async () => {
    await mkdir(join(getGlobalSkillsPath(), "Convex Best Practices"), { recursive: true });
    await writeFile(join(getGlobalSkillsPath(), "Convex Best Practices", "SKILL.md"), "# Skill");

    const items = await completeFromProvider("activeSkills");

    expect(items.map((item) => item.value)).toEqual(["Convex Best Practices"]);
  });

  test("profiles returns profile names", async () => {
    await profileCreate("work", {});

    const items = await completeFromProvider("profiles");

    expect(items.map((item) => item.value)).toEqual(["work"]);
  });

  test("profileSkills returns skills from targeted profile", async () => {
    const profile: Profile = {
      name: "work",
      skills: [{ skillName: "skill-a", v: 1, source: "test/source", addedAt: "2026-04-24T00:00:00.000Z" }],
    };
    await writeProfile(getProfilePath("work"), profile);

    const items = await completeFromProvider("profileSkills", {
      commandPath: ["profile", "rm"],
      options: { profile: "work" },
    });
    expect(items.map((item) => item.value)).toEqual(["skill-a"]);
  });

  test("supportedClients comes from VALID_CLIENT_IDS", async () => {
    const items = await completeFromProvider("supportedClients");
    expect(items.map((item) => item.value)).toEqual([...VALID_CLIENT_IDS]);
  });

  test("provider errors are swallowed", async () => {
    const items = await completeFromProvider("managedSkills");
    expect(Array.isArray(items)).toBe(true);
  });
});

describe("buildProgram", () => {
  test("builds command tree without parsing process argv", () => {
    const program = buildProgram({ enableActions: false });
    expect(program.name()).toBe("bsk");
    expect(program.commands.map((cmd) => cmd.name())).toContain("add");
    expect(program.commands.map((cmd) => cmd.name())).toContain("profile");
  });

  test("source CLI help still works", async () => {
    const result = await $`bun run ${cli} --help`.text();
    expect(result).toContain("Usage: bsk");
    expect(result).toContain("add");
  });
});

describe("completion formatting", () => {
  const items = [{ value: "alpha" }, { value: "Convex Best Practices" }];

  test("bash preserves one escaped candidate per line", () => {
    expect(formatCompletionItems("bash", items)).toContain("Convex\\ Best\\ Practices\n");
  });

  test("zsh uses newline separated values and preserves spaces", () => {
    expect(formatCompletionItems("zsh", items)).toContain("Convex Best Practices");
  });

  test("fish preserves spaces and supports descriptions", () => {
    const output = formatCompletionItems("fish", [{ value: "alpha", description: "A skill" }]);
    expect(output).toBe("alpha\tA skill\n");
  });
});

describe("completion engine", () => {
  beforeEach(async () => {
    await cleanTestHome();
  });

  test("completes top-level commands from commander and excludes __complete", async () => {
    const items = await complete({ line: "bsk ", point: 4 });
    const values = items.map((item) => item.value);
    expect(values).toContain("add");
    expect(values).toContain("profile");
    expect(values).toContain("completion");
    expect(values).not.toContain("__complete");
  });

  test("completes nested subcommands", async () => {
    const items = await complete({ line: "bsk profile ", point: "bsk profile ".length });
    expect(items.map((item) => item.value)).toContain("use");
    expect(items.map((item) => item.value)).toContain("clone");
  });

  test("completes command aliases from commander", async () => {
    const topLevel = await complete({ line: "bsk ", point: 4 });
    expect(topLevel.map((item) => item.value)).toContain("ls");
    expect(topLevel.map((item) => item.value)).toContain("i");

    const profileItems = await complete({ line: "bsk profile ", point: "bsk profile ".length });
    expect(profileItems.map((item) => item.value)).toContain("remove");
  });

  test("completes options", async () => {
    const items = await complete({ line: "bsk add --", point: "bsk add --".length });
    expect(items.map((item) => item.value)).toContain("--global");
    expect(items.map((item) => item.value)).toContain("--skill");
  });

  test("completes completion shell argument", async () => {
    const items = await complete({ line: "bsk completion ", point: "bsk completion ".length });
    expect(items.map((item) => item.value)).toEqual(["bash", "zsh", "fish"]);
  });

  test("completes mv target after skill argument", async () => {
    const items = await complete({ line: "bsk mv alpha ", point: "bsk mv alpha ".length });
    expect(items.map((item) => item.value)).toEqual(["global", "project"]);
  });

  test("resolves aliases to canonical metadata", async () => {
    const items = await complete({ line: "bsk move alpha ", point: "bsk move alpha ".length });
    expect(items.map((item) => item.value)).toEqual(["global", "project"]);
  });

  test("completes rm skill argument with spaces", async () => {
    await mkdir(join(getGlobalSkillsPath(), "Convex Best Practices"), { recursive: true });
    await writeFile(join(getGlobalSkillsPath(), "Convex Best Practices", "SKILL.md"), "# Skill");

    const items = await complete({ line: "bsk rm ", point: "bsk rm ".length });
    expect(items.map((item) => item.value)).toEqual(["Convex Best Practices"]);
  });

  test("continues completing a space-containing argument after an escaped space", async () => {
    await mkdir(join(getGlobalSkillsPath(), "Convex Best Practices"), { recursive: true });
    await writeFile(join(getGlobalSkillsPath(), "Convex Best Practices", "SKILL.md"), "# Skill");

    const line = "bsk rm Convex\\ ";
    const items = await complete({ line, point: line.length });
    expect(items.map((item) => item.value)).toEqual(["Convex Best Practices"]);
  });

  test("completes profile option values", async () => {
    await profileCreate("dev", {});
    const items = await complete({ line: "bsk profile rename --profile ", point: "bsk profile rename --profile ".length });
    expect(items.map((item) => item.value)).toEqual(["dev"]);
  });

  test("completes attached profile option values with full replacement token", async () => {
    await profileCreate("dev", {});
    const items = await complete({ line: "bsk profile rename --profile=d", point: "bsk profile rename --profile=d".length });
    expect(items.map((item) => item.value)).toEqual(["--profile=dev"]);
  });

  test("skips completed option values before positional completions", async () => {
    await profileCreate("dev", {});
    const items = await complete({ line: "bsk profile rename --profile dev ", point: "bsk profile rename --profile dev ".length });
    expect(items).toEqual([]);
  });

  test("completes existing profile apply profile name", async () => {
    await profileCreate("dev", {});
    const items = await complete({ line: "bsk profile apply ", point: "bsk profile apply ".length });
    expect(items.map((item) => item.value)).toEqual(["dev"]);
  });

  test("profile rm completes skills from --profile target", async () => {
    const profile: Profile = { name: "work", skills: [{ skillName: "skill-a", v: 1, source: "test/source", addedAt: "2026-04-24T00:00:00.000Z" }] };
    await writeProfile(getProfilePath("work"), profile);
    const items = await complete({ line: "bsk profile rm --profile work ", point: "bsk profile rm --profile work ".length });
    expect(items.map((item) => item.value)).toEqual(["skill-a"]);
  });

  test("profile rm completes skills from -p target", async () => {
    const profile: Profile = { name: "work", skills: [{ skillName: "skill-a", v: 1, source: "test/source", addedAt: "2026-04-24T00:00:00.000Z" }] };
    await writeProfile(getProfilePath("work"), profile);
    const items = await complete({ line: "bsk profile rm -p work ", point: "bsk profile rm -p work ".length });
    expect(items.map((item) => item.value)).toEqual(["skill-a"]);
  });

  test("file metadata returns file completion sentinel", async () => {
    const items = await complete({ line: "bsk sync import ", point: "bsk sync import ".length });
    expect(items).toEqual([{ value: "__BSK_COMPLETE_FILES__", kind: "file" }]);
  });
});

describe("completion shell scripts and CLI", () => {
  test("generates bash script", () => {
    const script = getCompletionScript("bash");
    expect(script).toContain("bsk __complete");
    expect(script).toContain("complete -F _bsk_completion bsk");
    expect(script).toContain("mapfile");
    expect(script).not.toContain("compgen -W");
  });

  test("generates zsh script", () => {
    const script = getCompletionScript("zsh");
    expect(script).toContain("#compdef bsk");
    expect(script).toContain("bsk __complete");
  });

  test("generates fish script with full commandline input and file fallback", () => {
    const script = getCompletionScript("fish");
    expect(script).toContain("complete -c bsk");
    expect(script).toContain("commandline -cp");
    expect(script).toContain("commandline -C");
    expect(script).toContain("bsk __complete");
    expect(script).toContain("-f -a");
    expect(script).toContain("-F");
  });

  test("cli prints completion script", async () => {
    const result = await $`bun run ${cli} completion bash`.text();
    expect(result).toContain("bsk __complete");
  });

  test("__complete prints escaped bash candidate with spaces", async () => {
    await cleanTestHome();
    await mkdir(join(getGlobalSkillsPath(), "Convex Best Practices"), { recursive: true });
    await writeFile(join(getGlobalSkillsPath(), "Convex Best Practices", "SKILL.md"), "# Skill");

    const proc = Bun.spawn(["bun", "run", cli, "__complete", "--shell", "bash", "--line", "bsk rm ", "--point", "7"], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, HOME: home(), NODE_ENV: "" },
    });
    const result = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(result).toContain("Convex\\ Best\\ Practices");
  });

  test("unsupported shell exits with an error", async () => {
    const proc = Bun.spawn(["bun", "run", cli, "completion", "powershell"], { stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unsupported shell: powershell");
  });

  test("parseShell accepts supported shells", () => {
    expect(parseShell("bash")).toBe("bash");
  });
});
