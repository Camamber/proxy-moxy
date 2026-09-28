import type { BreakpointStage } from '@proxy-moxy/shared';

/** Edits made while a request was parked; applied when it is released. */
export interface HoldEdits {
  body?: string;
}

/**
 * How a parked request moves on, named after the debugger controls:
 * `step` stops again at the next breakpoint, `continue` runs to the end without stopping.
 */
export type ReleaseMode = 'step' | 'continue';

export interface HoldResult {
  edits: HoldEdits;
  mode: ReleaseMode;
}

export interface HoldInfo {
  uid: string;
  recordId: string;
  stage: BreakpointStage;
  edits: HoldEdits;
}

interface Hold extends HoldInfo {
  resolve(result: HoldResult): void;
  reject(reason: Error): void;
}

/**
 * Breakpoints for paused sessions. A proxied request `hold()`s at a stage and stays
 * there until `release()` (step or continue), `releaseAll()` (resume) or `cancel()` (client gone).
 */
export class HoldRegistry {
  #holds = new Map<string, Hold>();

  hold(uid: string, recordId: string, stage: BreakpointStage): Promise<HoldResult> {
    return new Promise((resolve, reject) => {
      this.#holds.set(recordId, { uid, recordId, stage, edits: {}, resolve, reject });
    });
  }

  get(recordId: string): HoldInfo | null {
    const hold = this.#holds.get(recordId);
    return hold ? { uid: hold.uid, recordId, stage: hold.stage, edits: { ...hold.edits } } : null;
  }

  /** Merges edits into a parked request. False when it is not held. */
  edit(recordId: string, edits: HoldEdits): boolean {
    const hold = this.#holds.get(recordId);
    if (!hold) return false;
    Object.assign(hold.edits, edits);
    return true;
  }

  release(recordId: string, mode: ReleaseMode = 'step'): boolean {
    const hold = this.#take(recordId);
    if (!hold) return false;
    hold.resolve({ edits: hold.edits, mode });
    return true;
  }

  /** Releases every request parked in the session; returns how many. */
  releaseAll(uid: string, mode: ReleaseMode = 'continue'): number {
    let released = 0;
    for (const hold of [...this.#holds.values()]) {
      if (hold.uid === uid && this.release(hold.recordId, mode)) released += 1;
    }
    return released;
  }

  cancel(recordId: string, reason: Error): boolean {
    const hold = this.#take(recordId);
    if (!hold) return false;
    hold.reject(reason);
    return true;
  }

  #take(recordId: string): Hold | undefined {
    const hold = this.#holds.get(recordId);
    this.#holds.delete(recordId);
    return hold;
  }
}
