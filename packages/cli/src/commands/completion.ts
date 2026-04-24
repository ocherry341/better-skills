import { complete } from "../completion/engine.js";
import { formatCompletionItems } from "../completion/format.js";
import { getCompletionScript, parseShell } from "../completion/shells.js";

export async function printCompletionScript(shellValue: string): Promise<void> {
  const shell = parseShell(shellValue);
  process.stdout.write(getCompletionScript(shell));
}

export async function runComplete(opts: { shell?: string; line?: string; point?: string }): Promise<void> {
  const shell = opts.shell ? parseShell(opts.shell) : "bash";
  const line = opts.line ?? process.env.COMP_LINE ?? "";
  const parsedPoint = opts.point ? Number(opts.point) : process.env.COMP_POINT ? Number(process.env.COMP_POINT) : undefined;
  const point = Number.isFinite(parsedPoint) ? parsedPoint : line.length;
  const items = await complete({ line, point });

  process.stdout.write(formatCompletionItems(shell, items));
}
