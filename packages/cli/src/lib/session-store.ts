import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Full session document – mirrors the old Prisma `Session` model so every
 * downstream consumer (screens, hooks, dialogs) keeps working without changes.
 */
export interface Session {
  id: string;
  title: string;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
  messages: unknown[]; // UIMessage[] from the AI SDK
  /** CWD the session was started from – used for project scoping (Phase 5). */
  cwd: string;
}

/**
 * Lightweight summary returned by `listSessions()`.
 * Matches the shape the sessions-dialog and session list UI expect.
 */
export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  /** The CWD the session was created in – used for project scoping. */
  cwd: string;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const CONFIG_DIR = path.join(os.homedir(), ".mastercode");
const LEGACY_CONFIG_DIR = path.join(os.homedir(), ".nightcode");
const SESSIONS_DIR = path.join(CONFIG_DIR, "sessions");
const LEGACY_SESSIONS_DIR = path.join(LEGACY_CONFIG_DIR, "sessions");

function ensureSessionsDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    // Migrate legacy sessions if present
    if (fs.existsSync(LEGACY_SESSIONS_DIR)) {
      try {
        const files = fs.readdirSync(LEGACY_SESSIONS_DIR);
        for (const file of files) {
          if (file.endsWith(".json")) {
            fs.copyFileSync(
              path.join(LEGACY_SESSIONS_DIR, file),
              path.join(SESSIONS_DIR, file)
            );
          }
        }
      } catch {
        // Non-fatal
      }
    }
  }
}

function sessionFilePath(id: string): string {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * Generates a CUID-like identifier consistent with the old Prisma `@default(cuid())`.
 * Uses `crypto.randomUUID` under the hood for uniqueness; the exact format doesn't
 * matter as long as it is globally unique.
 */
function generateId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Atomic file helpers
// ---------------------------------------------------------------------------

/**
 * Writes `data` to `filePath` atomically: first writes to a `.tmp` sibling,
 * then renames into place.  This prevents corruption if the process is killed
 * mid-write.
 */
function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, json, "utf8");
  fs.renameSync(tmpPath, filePath);
}

/**
 * Reads and parses a JSON file, returning `null` if the file doesn't exist or
 * is unreadable.
 */
function readJson<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a brand-new session and persist it to disk.
 */
export function createSession(title: string): Session {
  ensureSessionsDir();

  const now = new Date().toISOString();
  const session: Session = {
    id: generateId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    cwd: process.cwd(),
  };

  atomicWriteJson(sessionFilePath(session.id), session);
  return session;
}

/**
 * Retrieve a single session by ID.
 * Returns `null` if the session file doesn't exist.
 */
export function getSession(id: string): Session | null {
  ensureSessionsDir();
  return readJson<Session>(sessionFilePath(id));
}

/**
 * List all sessions, sorted by `createdAt` descending (newest first).
 * Returns lightweight summaries — the full message payload is not loaded.
 */
export function listSessions(): SessionSummary[] {
  ensureSessionsDir();

  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  const summaries: SessionSummary[] = [];

  for (const file of files) {
    const session = readJson<Session>(path.join(SESSIONS_DIR, file));
    if (session) {
      summaries.push({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        cwd: session.cwd ?? "",
      });
    }
  }

  // Newest first
  summaries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return summaries;
}

/**
 * List only sessions whose `cwd` matches the given directory (defaults to
 * `process.cwd()`). Useful for showing project-scoped sessions at the top.
 * Results are sorted newest-first.
 */
export function listSessionsByCwd(cwd: string = process.cwd()): SessionSummary[] {
  return listSessions().filter((s) => s.cwd === cwd);
}

/**
 * Replace the message array for an existing session. Also bumps `updatedAt`.
 * Returns `true` if the session was found and updated, `false` otherwise.
 */
export function updateSessionMessages(
  id: string,
  messages: unknown[],
): boolean {
  ensureSessionsDir();

  const session = readJson<Session>(sessionFilePath(id));
  if (!session) return false;

  session.messages = messages;
  session.updatedAt = new Date().toISOString();
  atomicWriteJson(sessionFilePath(id), session);
  return true;
}

/**
 * Delete a session file from disk.
 * Returns `true` if the file existed and was removed, `false` otherwise.
 */
export function deleteSession(id: string): boolean {
  const filePath = sessionFilePath(id);
  if (!fs.existsSync(filePath)) return false;

  fs.unlinkSync(filePath);
  return true;
}
