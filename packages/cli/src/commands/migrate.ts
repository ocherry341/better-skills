import { save, type SaveOptions } from "./save.js";

export type MigrateOptions = SaveOptions;

/**
 * @deprecated Use `save` instead. This is a compatibility alias.
 */
export async function migrate(options: MigrateOptions = {}): Promise<void> {
  return save(options);
}
