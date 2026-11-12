import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillManager } from "./skill-manager";

let tempDir: string;

beforeEach(() => {
  SkillManager.clear();
  tempDir = mkdtempSync(join(tmpdir(), "skills-"));
});

afterEach(() => {
  SkillManager.clear();
  rmSync(tempDir, { recursive: true, force: true });
});

function writeSkill(relDir: string, content: string) {
  const dir = join(tempDir, ".mastercode", "skills", relDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), content, "utf-8");
}

describe("SkillManager", () => {
  test("loadSkills scans directory and parses YAML frontmatter", () => {
    writeSkill(
      "git-workflows",
      `---
name: git-workflows
description: Advanced git rebasing and squashing
triggers:
  - rebase
  - squash
---
# Git Workflows
Rebase often.
`,
    );

    const skills = SkillManager.loadSkills(tempDir, join(tempDir, "home"));

    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe("git-workflows");
    expect(skills[0]!.description).toBe("Advanced git rebasing and squashing");
    expect(skills[0]!.triggers).toEqual(["rebase", "squash"]);
    expect(skills[0]!.content).toContain("Rebase often");
  });

  test("getCatalogSummary correctly formats XML block", () => {
    writeSkill(
      "docker-ops",
      `---
name: docker-ops
description: Multi-stage Dockerfile setup
---
`,
    );

    SkillManager.loadSkills(tempDir, join(tempDir, "home"));
    const summary = SkillManager.getCatalogSummary();

    expect(summary).toContain("<available_skills>");
    expect(summary).toContain("</available_skills>");
    expect(summary).toContain("- docker-ops: Multi-stage Dockerfile setup");
  });

  test("getSkill returns content when found and undefined when not found", () => {
    writeSkill(
      "python-tips",
      `---
name: python-tips
description: Python best practices
---
Use virtualenvs.
`,
    );

    SkillManager.loadSkills(tempDir, join(tempDir, "home"));

    const skill = SkillManager.getSkill("python-tips");
    expect(skill).toBeDefined();
    expect(skill!.content).toContain("Use virtualenvs");
    expect(SkillManager.getSkill("does-not-exist")).toBeUndefined();
  });

  test("falls back gracefully when a skill folder has no SKILL.md or malformed frontmatter", () => {
    // Folder with no SKILL.md
    mkdirSync(join(tempDir, ".mastercode", "skills", "empty-skill"), { recursive: true });

    // Folder with SKILL.md but no frontmatter
    const noFrontDir = join(tempDir, ".mastercode", "skills", "no-frontmatter");
    mkdirSync(noFrontDir, { recursive: true });
    writeFileSync(join(noFrontDir, "SKILL.md"), "Just a body without frontmatter.\n", "utf-8");

    const skills = SkillManager.loadSkills(tempDir, join(tempDir, "home"));
    const names = skills.map((skill) => skill.name);

    expect(names).not.toContain("empty-skill");
    expect(names).toContain("no-frontmatter");

    const noFront = skills.find((skill) => skill.name === "no-frontmatter");
    expect(noFront).toBeDefined();
    expect(noFront!.description).toBe("");
  });
});
