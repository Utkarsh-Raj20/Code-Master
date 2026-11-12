---
name: git-workflow
description: Professional Git version control workflow. Enforces Conventional Commits, trunk-based/feature branching, clean rebase strategies, and conflict-free pull request drafting.
triggers: ["git", "commit", "branch", "rebase", "merge", "pr", "pull-request", "stash", "cherry-pick", "conflict"]
---

# Professional Git Workflow & Commit Standards

This skill guides atomic commits, branching cleanliness, history curation, and collaborative git practices.

## 1. Conventional Commits Specification

All commit messages must follow the Conventional Commits format:

```text
<type>(<optional scope>): <imperative description>

[optional body explaining context, tradeoffs, and 'why']

[optional footer(s), e.g. Closes #123, BREAKING CHANGE: ...]
```

### Commit Types
- `feat`: A new feature for the user or system
- `fix`: A bug fix
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves execution or rendering performance
- `test`: Adding missing tests or correcting existing tests
- `docs`: Documentation only changes
- `chore`: Build system changes, dependency updates, tooling configuration

### Good Examples
- `feat(auth): support PKCE OAuth2 flow for mobile redirects`
- `fix(parser): resolve off-by-one error when slicing multi-byte unicode`
- `refactor(session-store): replace in-memory array with atomic file operations`

### Bad Examples
- `WIP`
- `fixed bug`
- `updates`

---

## 2. Branching & Lifecycle Strategy

- **Branch Naming**:
  - `feat/<short-description>` (e.g. `feat/oauth-pkce`)
  - `fix/<issue-number>-<short-description>` (e.g. `fix/402-token-refresh`)
  - `refactor/<module>` (e.g. `refactor/command-menu`)
- **Trunk-Based Focus**: Keep feature branches short-lived (< 2 days). Merge frequently into `main` to prevent drift.

---

## 3. Atomic Commits & Staging Hygiene

- **One Idea per Commit**: Do not mix formatting changes, dependency bumps, and feature logic in a single commit.
- **Stage Interactively**: Use `git add -p` to stage targeted hunks rather than blindly running `git add .`.
- **Verify Clean State**: Always run `git diff --staged` before running `git commit` to verify no leftover `console.log`, `.env` secrets, or accidental edits are committed.

---

## 4. Rebase over Merge for Feature Branches

Keep git log history linear and clean:

```bash
# 1. Fetch latest changes from remote
git fetch origin main

# 2. Rebase feature branch on top of main
git rebase origin/main

# 3. If conflicts occur:
# Inspect conflicted files, resolve markers (<<<<<<<, =======, >>>>>>>)
git add <resolved-file>
git rebase --continue

# 4. Push updated feature branch safely
git push --force-with-lease origin feat/my-branch
```

---

## 5. Pull Request (PR) Quality Checklist

When opening a Pull Request:
1. **Summary**: What does this PR change and why was this approach chosen?
2. **Testing Done**: List automated tests written and manual verification steps tested.
3. **Screenshots / GIFs**: For any user-facing visual modifications.
4. **Breaking Changes**: Highlight any deprecated APIs, required migrations, or config updates.

