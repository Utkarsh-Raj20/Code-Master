import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * A single discovered skill parsed from a `SKILL.md` file.
 */
export interface Skill {
  name: string;
  description: string;
  triggers: string[];
  content: string;
  filePath: string;
}

interface Frontmatter {
  name?: string;
  description?: string;
  triggers?: string[];
  body: string;
}

/**
 * Extract YAML frontmatter delimited by leading/trailing `---` lines.
 * Implemented with plain string parsing (no external YAML dependency).
 */
function parseFrontmatter(raw: string): Frontmatter {
  const normalized = raw.replace(/^﻿/, "");
  if (!/^---\s*\r?\n/.test(normalized)) {
    return { body: normalized };
  }

  const lines = normalized.split(/\r?\n/);
  // Lines[0] is the opening `---`.
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i] ?? "")) {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    return { body: normalized };
  }

  const headerLines = lines.slice(1, closingIndex);
  const body = lines.slice(closingIndex + 1).join("\n");

  let name: string | undefined;
  let description: string | undefined;
  const triggers: string[] = [];
  let inTriggers = false;

  for (const line of headerLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const nameMatch = trimmed.match(/^name\s*:\s*(.+)$/);
    if (nameMatch) {
      name = nameMatch[1]!.trim().replace(/^["']|["']$/g, "");
      continue;
    }

    const descMatch = trimmed.match(/^description\s*:\s*(.+)$/);
    if (descMatch) {
      description = descMatch[1]!.trim().replace(/^["']|["']$/g, "");
      continue;
    }

    if (/^triggers\s*:/.test(trimmed)) {
      inTriggers = true;
      const inline = trimmed.match(/^triggers\s*:\s*\[(.*)\]$/);
      if (inline) {
        for (const item of inline[1]!.split(",")) {
          const value = item.trim().replace(/^["']|["']$/g, "");
          if (value) triggers.push(value);
        }
        inTriggers = false;
      }
      continue;
    }

    // A block-list item under `triggers:` (e.g. `- rebase`).
    if (inTriggers) {
      const itemMatch = trimmed.match(/^-\s*(.+)$/);
      if (itemMatch) {
        triggers.push(itemMatch[1]!.trim().replace(/^["']|["']$/g, ""));
        continue;
      }
      // A new top-level key terminates the triggers list.
      if (/^[a-zA-Z][a-zA-Z0-9_-]*\s*:/.test(trimmed)) {
        inTriggers = false;
      }
      continue;
    }
  }

  return { name, description, triggers, body };
}

const SKILL_DIR_CANDIDATES = (cwd: string, homeDir: string): string[] => [
  path.join(cwd, ".mastercode", "skills"),
  path.join(cwd, ".claude", "skills"),
  path.join(homeDir, ".mastercode", "skills"),
];

function readSkillFile(filePath: string, fallbackName: string): Skill | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }

  const frontmatter = parseFrontmatter(raw);
  const name = frontmatter.name?.trim() || fallbackName;

  return {
    name,
    description: frontmatter.description?.trim() ?? "",
    triggers: frontmatter.triggers ?? [],
    content: frontmatter.body.trim(),
    filePath,
  };
}

/**
 * Skills discovery, frontmatter parsing, and catalog generation.
 *
 * Progressive disclosure: the system prompt receives only a lightweight catalog
 * (`<available_skills>`); the agent then calls `activateSkill` to pull the full
 * markdown instructions into context on demand.
 */
export class SkillManager {
  private static skills: Skill[] | null = null;

  /**
   * Scan project & global skill directories and (re)populate the in-memory cache.
   * Returns the full list of discovered skills.
   */
  static loadSkills(
    cwd: string = process.cwd(),
    homeDir: string = os.homedir(),
  ): Skill[] {
    const found: Skill[] = [];

    for (const skillsDir of SKILL_DIR_CANDIDATES(cwd, homeDir)) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      } catch {
        continue; // directory does not exist
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillDir = path.join(skillsDir, entry.name);
        const skillFile = path.join(skillDir, "SKILL.md");

        if (!fs.existsSync(skillFile)) continue; // folder has no SKILL.md — skip

        const skill = readSkillFile(skillFile, entry.name);
        if (skill && !found.some((s) => s.name === skill.name)) {
          found.push(skill);
        }
      }
    }

    this.skills = found;
    return found;
  }

  static getSkills(): Skill[] {
    if (this.skills === null) this.loadSkills();
    return this.skills ?? [];
  }

  static getSkillNames(): string[] {
    return this.getSkills().map((skill) => skill.name);
  }

  static getSkill(name: string): Skill | undefined {
    return this.getSkills().find((skill) => skill.name === name);
  }

  /**
   * Generate the lightweight `<available_skills>` catalog for the system prompt.
   */
  static getCatalogSummary(): string {
    const skills = this.getSkills();
    if (skills.length === 0) return "";

    const lines = skills.map((skill) => {
      const desc = skill.description || "No description";
      return `- ${skill.name}: ${desc}`;
    });

    return `<available_skills>\n${lines.join("\n")}\n</available_skills>`;
  }

  static clear(): void {
    this.skills = null;
  }
}
