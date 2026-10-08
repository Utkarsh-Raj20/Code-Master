import fs from "node:fs";
import path from "node:path";

/**
 * The filename Mastercode looks for in the project root.
 * Works exactly like Claude Code's `CLAUDE.md` — place it in any project
 * directory and its contents are injected into every system prompt when
 * Mastercode is launched from that directory.
 */
const INIT_FILE_NAMES = [".mastercode.md", "CLAUDE.md", "AGENT.md", ".nightcode.md"];

/**
 * Walk up from `startDir` looking for a project config file, stopping at the
 * filesystem root. Checked in priority order:
 *   1. `.mastercode.md`
 *   2. `CLAUDE.md`
 *   3. `AGENT.md`
 *   4. `.nightcode.md` (legacy)
 *
 * Returns the contents of the first file found, or `null` if none exists.
 * This mirrors Claude Code's behaviour: you can place any of these files in
 * any ancestor directory and it will be picked up automatically.
 */
export function findProjectConfig(startDir: string = process.cwd()): string | null {
  let current = path.resolve(startDir);

  // Safety limit: don't climb more than 20 levels
  for (let i = 0; i < 20; i++) {
    for (const fileName of INIT_FILE_NAMES) {
      const candidate = path.join(current, fileName);
      if (fs.existsSync(candidate)) {
        try {
          return fs.readFileSync(candidate, "utf8").trim();
        } catch {
          return null;
        }
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }

  return null;
}

/**
 * Returns the full path of the `.mastercode.md` file that would be loaded from
 * the given directory, or `null` if none exists.
 */
export function getProjectConfigPath(startDir: string = process.cwd()): string | null {
  let current = path.resolve(startDir);

  for (let i = 0; i < 20; i++) {
    for (const fileName of INIT_FILE_NAMES) {
      const candidate = path.join(current, fileName);
      if (fs.existsSync(candidate)) return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}
