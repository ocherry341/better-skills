import { clientLs } from "../commands/client.js";
import { ls, lsAll } from "../commands/ls.js";
import { profileLs } from "../commands/profile.js";
import { VALID_CLIENT_IDS } from "../core/clients.js";
import { getActiveProfileName, readProfile } from "../core/profile.js";
import { getProfilePath } from "../utils/paths.js";
import type { CompletionItem, CompletionProviderContext, CompletionProviderName } from "./types.js";

export async function completeFromProvider(
  name: CompletionProviderName,
  context: CompletionProviderContext = { commandPath: [], options: {} },
): Promise<CompletionItem[]> {
  try {
    switch (name) {
      case "activeSkills": {
        const entries = await ls();
        return entries.map((entry) => ({ value: entry.name, kind: "argument" as const }));
      }
      case "managedSkills": {
        const entries = await lsAll();
        return entries.map((entry) => ({ value: entry.name, kind: "argument" as const }));
      }
      case "profiles": {
        const entries = await profileLs();
        return entries.map((entry) => ({ value: entry.name, kind: "argument" as const }));
      }
      case "profileSkills": {
        const optionProfile = context.options["profile"] ?? context.options["p"];
        const profileName = typeof optionProfile === "string" ? optionProfile : await getActiveProfileName();
        if (!profileName) return [];
        const profile = await readProfile(getProfilePath(profileName));
        return profile.skills.map((skill) => ({ value: skill.skillName, kind: "argument" as const }));
      }
      case "enabledClients": {
        const entries = await clientLs();
        return entries
          .filter((entry) => entry.enabled)
          .map((entry) => ({ value: entry.id, kind: "argument" as const }));
      }
      case "supportedClients": {
        return [...VALID_CLIENT_IDS].map((id) => ({ value: id, kind: "argument" as const }));
      }
    }
  } catch {
    return [];
  }
}
