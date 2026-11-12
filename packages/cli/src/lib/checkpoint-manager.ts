import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

/**
 * A single file snapshot captured before a destructive operation.
 */
export interface FileSnapshot {
  stepId: string;
  filePath: string;
  originalContent: string | null; // null if the file was created for the first time
  timestamp: number;
}

interface Step {
  stepId: string;
  snapshots: FileSnapshot[];
}

/**
 * In-memory checkpoint & undo engine.
 *
 * Before any `writeFile` / `editFile` mutation, `recordPreEdit` captures the
 * file's original content. Multiple files mutated during a single agent turn
 * are grouped into one "step" so that `/undo` can atomically roll them all back.
 */
export class CheckpointManager {
  private static steps: Step[] = [];
  private static pending: Step | null = null;
  private static idCounter = 0;

  private static nextStepId(): string {
    this.idCounter += 1;
    return `step-${Date.now()}-${this.idCounter}`;
  }

  /**
   * Record the current state of `filePath` before it is mutated. Snapshots are
   * grouped by `stepId` (or an auto-generated step when omitted) so a single
   * turn can be rolled back atomically.
   */
  static async recordPreEdit(filePath: string, stepId?: string): Promise<void> {
    let step = this.pending;
    if (!step || (stepId && step.stepId !== stepId)) {
      step = { stepId: stepId ?? this.nextStepId(), snapshots: [] };
      this.pending = step;
    }

    // Only keep the earliest snapshot for a given file within a step.
    if (step.snapshots.some((snapshot) => snapshot.filePath === filePath)) return;

    let originalContent: string | null = null;
    if (existsSync(filePath)) {
      originalContent = await readFile(filePath, "utf-8");
    }

    step.snapshots.push({
      stepId: step.stepId,
      filePath,
      originalContent,
      timestamp: Date.now(),
    });
  }

  /**
   * Seal the pending step and push it onto the history stack. Subsequent
   * `recordPreEdit` calls (without a matching `stepId`) start a new step.
   */
  static commitStep(stepId?: string): void {
    if (!this.pending) return;
    if (stepId && this.pending.stepId !== stepId) return;
    this.steps.push(this.pending);
    this.pending = null;
  }

  /**
   * Restore the most recent step. Prefers the still-pending step (the latest
   * work) and otherwise falls back to the last committed step.
   */
  static async rollbackLastStep(): Promise<{
    restoredFiles: string[];
    stepId: string | null;
  }> {
    let step: Step | null;
    if (this.pending) {
      step = this.pending;
      this.pending = null;
    } else {
      step = this.steps.pop() ?? null;
    }

    if (!step) {
      return { restoredFiles: [], stepId: null };
    }

    const restoredFiles: string[] = [];
    for (const snapshot of step.snapshots) {
      try {
        if (snapshot.originalContent === null) {
          // The file did not exist before this step — rolling back deletes it.
          if (existsSync(snapshot.filePath)) {
            await unlink(snapshot.filePath);
          }
        } else {
          await mkdir(dirname(snapshot.filePath), { recursive: true });
          await writeFile(snapshot.filePath, snapshot.originalContent, "utf-8");
        }
        restoredFiles.push(snapshot.filePath);
      } catch {
        // Best-effort: continue restoring the remaining files even if one fails.
      }
    }

    return { restoredFiles, stepId: step.stepId };
  }

  static clear(): void {
    this.steps = [];
    this.pending = null;
  }

  /**
   * Total number of file snapshots currently tracked (pending + committed).
   */
  static getHistoryCount(): number {
    const pendingCount = this.pending ? this.pending.snapshots.length : 0;
    const committedCount = this.steps.reduce(
      (sum, step) => sum + step.snapshots.length,
      0,
    );
    return committedCount + pendingCount;
  }
}
