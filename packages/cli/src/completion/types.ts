export const supportedShells = ["bash", "zsh", "fish"] as const;
export type SupportedShell = typeof supportedShells[number];

export type CompletionKind = "command" | "option" | "argument" | "file";

export interface CompletionItem {
  value: string;
  description?: string;
  kind?: CompletionKind;
}

export type CompletionProviderName =
  | "activeSkills"
  | "managedSkills"
  | "profiles"
  | "profileSkills"
  | "enabledClients"
  | "supportedClients";

export interface CompletionArgMetadata {
  values?: string[];
  provider?: CompletionProviderName;
  file?: boolean;
}

export interface CompletionCommandMetadata {
  args?: CompletionArgMetadata[];
  options?: Record<string, CompletionArgMetadata>;
}

export interface CompletionProviderContext {
  commandPath: string[];
  options: Record<string, string | boolean | string[]>;
}

export type CompletionMetadata = Record<string, CompletionCommandMetadata>;
