import fs from "node:fs";
import path from "node:path";

/**
 * Extract clean project name from package.json or directory name.
 */
export function getProjectName(cwd: string = process.cwd()): string {
  try {
    const pkgPath = path.join(cwd, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (typeof pkg.name === "string" && pkg.name.trim()) {
        const clean = pkg.name.split("/").pop()?.replace(/^@/, "").trim();
        if (clean) return clean;
      }
    }
  } catch {}

  const base = path.basename(path.resolve(cwd)).trim();
  return base || "project";
}

/**
 * Return candidate project config filenames for a given directory,
 * prioritized by project name (e.g. `aone.md`, `nightcode.md`), followed
 * by standard fallback names.
 */
function getCandidateFileNames(dir: string): string[] {
  const projName = getProjectName(dir);
  const names = [
    `${projName}.md`,
    `${projName.toLowerCase()}.md`,
    ".mastercode.md",
    "CLAUDE.md",
    "AGENT.md",
    ".nightcode.md",
  ];
  return Array.from(new Set(names));
}

/**
 * Walk up from `startDir` looking for a project config file, stopping at the
 * filesystem root. Checked in priority order:
 *   1. `<projectname>.md` (e.g. `aone.md`, `nightcode.md`)
 *   2. `.mastercode.md`
 *   3. `CLAUDE.md`
 *   4. `AGENT.md`
 *   5. `.nightcode.md` (legacy)
 *
 * Returns the contents of the first file found, or `null` if none exists.
 */
export function findProjectConfig(startDir: string = process.cwd()): string | null {
  let current = path.resolve(startDir);

  // Safety limit: don't climb more than 20 levels
  for (let i = 0; i < 20; i++) {
    const candidates = getCandidateFileNames(current);
    for (const fileName of candidates) {
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
 * Returns the full path of the project instructions file that would be loaded from
 * the given directory, or `null` if none exists.
 */
export function getProjectConfigPath(startDir: string = process.cwd()): string | null {
  let current = path.resolve(startDir);

  for (let i = 0; i < 20; i++) {
    const candidates = getCandidateFileNames(current);
    for (const fileName of candidates) {
      const candidate = path.join(current, fileName);
      if (fs.existsSync(candidate)) return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}
