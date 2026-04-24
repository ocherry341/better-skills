import type { CompletionMetadata } from "./types.js";
import { supportedShells } from "./types.js";

export const completionMetadata: CompletionMetadata = {
  completion: { args: [{ values: [...supportedShells] }] },
  rm: { args: [{ provider: "activeSkills" }] },
  mv: { args: [{ provider: "activeSkills" }, { values: ["global", "project"] }] },
  "profile use": { args: [{ provider: "profiles" }] },
  "profile show": { args: [{ provider: "profiles" }] },
  "profile add": { options: { "--profile": { provider: "profiles" }, "-p": { provider: "profiles" } } },
  "profile rm": {
    args: [{ provider: "profileSkills" }],
    options: { "--profile": { provider: "profiles" }, "-p": { provider: "profiles" } },
  },
  "profile delete": {
    args: [{ provider: "profiles" }],
    options: { "--profile": { provider: "profiles" }, "-p": { provider: "profiles" } },
  },
  "profile rename": {
    args: [{ provider: "profiles" }],
    options: { "--profile": { provider: "profiles" }, "-p": { provider: "profiles" } },
  },
  "profile clone": {
    args: [{ provider: "profiles" }],
    options: { "--profile": { provider: "profiles" }, "-p": { provider: "profiles" } },
  },
  "profile apply": { args: [{ provider: "profiles" }] },
  "client rm": { args: [{ provider: "enabledClients" }] },
  "client add": { args: [{ provider: "supportedClients" }] },
  "sync import": { args: [{ file: true }] },
};
