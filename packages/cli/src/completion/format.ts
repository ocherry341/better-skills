import type { CompletionItem, SupportedShell } from "./types.js";

export function formatCompletionItems(shell: SupportedShell, items: CompletionItem[]): string {
  const lines = items.map((item) => {
    if (shell === "bash") return escapeBashWord(item.value);
    if (shell === "fish" && item.description) return `${item.value}\t${item.description}`;
    return item.value;
  });
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

function escapeBashWord(value: string): string {
  return value.replace(/[\\\s"'`$&|;<>(){}[\]*?!#~]/g, "\\$&");
}
