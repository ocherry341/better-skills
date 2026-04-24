import type { Command, Option } from "commander";
import { buildProgram } from "../cli.js";
import { completionMetadata } from "./metadata.js";
import { completeFromProvider } from "./providers.js";
import type { CompletionArgMetadata, CompletionItem } from "./types.js";

export interface CompleteInput {
  line: string;
  point?: number;
}

interface ParsedLine {
  words: string[];
  endsWithSpace: boolean;
}

interface ResolveState {
  command: Command;
  path: string[];
  args: string[];
  options: Record<string, string | boolean | string[]>;
  pendingOption?: Option;
}

const fileSentinel: CompletionItem = { value: "__BSK_COMPLETE_FILES__", kind: "file" };

export async function complete(input: CompleteInput): Promise<CompletionItem[]> {
  const program = buildProgram({ enableActions: false });
  const point = input.point ?? input.line.length;
  const parsed = parseLine(input.line.slice(0, point));
  const current = parsed.endsWithSpace ? "" : parsed.words.at(-1) ?? "";
  const consumed = parsed.endsWithSpace ? parsed.words : parsed.words.slice(0, -1);
  const meaningful = consumed[0] === program.name() ? consumed.slice(1) : consumed;
  const state = resolveCommand(program, meaningful);

  const optionValueItems = await completeOptionValue(state, current);
  if (optionValueItems) return optionValueItems;

  if (current.startsWith("-")) return filterItems(getOptions(state.command), current);
  if (state.args.length === 0 && state.command.commands.length > 0) {
    return filterItems(getSubcommands(state.command), current);
  }

  const argItems = await completeArgument(state.path, state.args.length, state.options);
  return filterItems(argItems, current);
}

function parseLine(line: string): ParsedLine {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let endsWithSpace = false;

  for (const char of line) {
    if (escaped) {
      current += char;
      escaped = false;
      endsWithSpace = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      endsWithSpace = false;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      endsWithSpace = false;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      endsWithSpace = false;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        words.push(current);
        current = "";
      }
      endsWithSpace = true;
      continue;
    }
    current += char;
    endsWithSpace = false;
  }

  if (current.length > 0) words.push(current);
  return { words, endsWithSpace };
}

function resolveCommand(program: Command, words: string[]): ResolveState {
  let command = program;
  const path: string[] = [];
  const args: string[] = [];
  const options: Record<string, string | boolean | string[]> = {};
  let pendingOption: Option | undefined;

  for (let index = 0; index < words.length; index++) {
    const word = words[index]!;

    if (pendingOption) {
      if (!word.startsWith("-") || pendingOption.required) {
        recordOptionValue(options, pendingOption, word);
        if (!isVariadic(pendingOption)) pendingOption = undefined;
        continue;
      }
      pendingOption = undefined;
    }

    const subcommand = args.length === 0 ? findSubcommand(command, word) : undefined;
    if (subcommand) {
      command = subcommand;
      path.push(subcommand.name());
      args.length = 0;
      pendingOption = undefined;
      continue;
    }

    const attached = parseAttachedOption(command, word);
    if (attached) {
      recordOptionValue(options, attached.option, attached.value);
      continue;
    }

    const option = findOption(command, word);
    if (option) {
      if (optionConsumesValue(option)) {
        pendingOption = option;
      } else {
        recordOptionValue(options, option, true);
      }
      continue;
    }

    args.push(word);
  }

  return { command, path, args, options, pendingOption };
}

function findSubcommand(command: Command, word: string): Command | undefined {
  return command.commands.find((cmd) => cmd.name() === word || cmd.aliases().includes(word));
}

function parseAttachedOption(command: Command, word: string): { option: Option; value: string } | undefined {
  const equals = word.indexOf("=");
  if (equals === -1) return undefined;
  const flag = word.slice(0, equals);
  const option = findOption(command, flag);
  if (!option || !optionConsumesValue(option)) return undefined;
  return { option, value: word.slice(equals + 1) };
}

function findOption(command: Command, flag: string): Option | undefined {
  return command.options.find((option) => option.long === flag || option.short === flag);
}

function optionConsumesValue(option: Option): boolean {
  return Boolean(option.required || option.optional || isVariadic(option));
}

function isVariadic(option: Option): boolean {
  return Boolean((option as Option & { variadic?: boolean }).variadic);
}

function recordOptionValue(options: Record<string, string | boolean | string[]>, option: Option, value: string | boolean): void {
  const keys = [option.long?.replace(/^--/, ""), option.short?.replace(/^-/, "")].filter(Boolean) as string[];
  for (const key of keys) {
    if (isVariadic(option) && typeof value === "string") {
      const existing = options[key];
      options[key] = Array.isArray(existing) ? [...existing, value] : existing ? [String(existing), value] : [value];
    } else {
      options[key] = value;
    }
  }
}

async function completeOptionValue(state: ResolveState, current: string): Promise<CompletionItem[] | undefined> {
  const metadata = completionMetadata[state.path.join(" ")];
  if (!metadata?.options) return undefined;

  const attached = current.match(/^(--[^=]+)=(.*)$/);
  if (attached) {
    const [, flag, prefix] = attached;
    const argMeta = metadata.options[flag!];
    if (!argMeta) return undefined;
    const items = await itemsFromMetadata(argMeta, state.path, state.options);
    return filterItems(items, prefix!).map((item) => ({ ...item, value: `${flag}=${item.value}` }));
  }

  if (state.pendingOption) {
    const flag = state.pendingOption.long ?? state.pendingOption.short;
    if (!flag) return undefined;
    const argMeta = metadata.options[flag] ?? (state.pendingOption.short ? metadata.options[state.pendingOption.short] : undefined);
    if (!argMeta) return undefined;
    return filterItems(await itemsFromMetadata(argMeta, state.path, state.options), current);
  }

  return undefined;
}

function getSubcommands(command: Command): CompletionItem[] {
  return command.commands
    .filter((cmd) => cmd.name() !== "__complete")
    .flatMap((cmd) => [
      { value: cmd.name(), description: cmd.description(), kind: "command" as const },
      ...cmd.aliases().map((alias) => ({ value: alias, description: cmd.description(), kind: "command" as const })),
    ]);
}

function getOptions(command: Command): CompletionItem[] {
  return command.options.flatMap((option) => [option.long, option.short].filter(Boolean).map((flag) => ({
    value: flag!,
    description: option.description,
    kind: "option" as const,
  })));
}

async function completeArgument(
  path: string[],
  argIndex: number,
  options: Record<string, string | boolean | string[]>,
): Promise<CompletionItem[]> {
  const commandPath = path.join(" ");
  if ((commandPath === "profile rename" || commandPath === "profile clone") && (options.profile || options.p) && argIndex === 0) {
    return [];
  }
  const argMeta = completionMetadata[commandPath]?.args?.[argIndex];
  if (!argMeta) return [];
  return itemsFromMetadata(argMeta, path, options);
}

async function itemsFromMetadata(
  argMeta: CompletionArgMetadata,
  path: string[],
  options: Record<string, string | boolean | string[]>,
): Promise<CompletionItem[]> {
  if (argMeta.file) return [fileSentinel];
  if (argMeta.values) return argMeta.values.map((value) => ({ value, kind: "argument" as const }));
  if (argMeta.provider) return completeFromProvider(argMeta.provider, { commandPath: path, options });
  return [];
}

function filterItems(items: CompletionItem[], prefix: string): CompletionItem[] {
  if (!prefix) return items;
  return items.filter((item) => item.value.startsWith(prefix));
}
