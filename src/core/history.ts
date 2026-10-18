import { applyPatches, type Patch } from 'immer';
import { HISTORY_LIMIT } from './constants';

export interface HistoryEntry {
  patches: Patch[];
  inverse: Patch[];
  key?: string; // entries with the same key in quick succession are merged
  time: number;
}

/** Undo/redo stack built on Immer patches. One instance per scene. */
export class History {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];

  constructor(
    private limit = HISTORY_LIMIT,
    private mergeWindow = 1000,
  ) {}

  push(patches: Patch[], inverse: Patch[], key?: string, now = Date.now()): void {
    if (patches.length === 0) return;
    this.future = [];
    const last = this.past[this.past.length - 1];
    if (key && last && last.key === key && now - last.time < this.mergeWindow) {
      last.patches = [...last.patches, ...patches];
      last.inverse = [...inverse, ...last.inverse];
      last.time = now;
      return;
    }
    this.past.push({ patches, inverse, key, time: now });
    if (this.past.length > this.limit) this.past.shift();
  }

  undo<T>(state: T): T | null {
    const entry = this.past.pop();
    if (!entry) return null;
    this.future.push(entry);
    return applyPatches(state as object, entry.inverse) as T;
  }

  redo<T>(state: T): T | null {
    const entry = this.future.pop();
    if (!entry) return null;
    this.past.push(entry);
    return applyPatches(state as object, entry.patches) as T;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get size(): number {
    return this.past.length;
  }
}
