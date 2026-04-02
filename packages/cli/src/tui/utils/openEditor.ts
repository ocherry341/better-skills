import { spawn } from "node:child_process";

const LEAVE_ALT_BUFFER = "\x1b[?1049l";
const ENTER_ALT_BUFFER = "\x1b[?1049h";

export function openInEditor(path: string): Promise<void> {
  const editor = process.env.EDITOR || "vi";
  return new Promise((resolve, reject) => {
    process.stdout.write(LEAVE_ALT_BUFFER);

    const child = spawn(editor, [path], {
      stdio: "inherit",
    });

    child.on("error", (err) => {
      process.stdout.write(ENTER_ALT_BUFFER);
      reject(err);
    });

    child.on("close", () => {
      process.stdout.write(ENTER_ALT_BUFFER);
      process.stdout.write("\x1b[2J\x1b[H");
      resolve();
    });
  });
}
