import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Isolate tests from the real home directory.
// Must run before any module reads os.homedir().
const fakeHome = mkdtempSync(join(tmpdir(), "bsk-test-home-"));
process.env.HOME = fakeHome;
