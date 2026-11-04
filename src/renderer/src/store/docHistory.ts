import type { RgbaImage } from '@core/image';
import type { FilterStep } from '@core/filters';

/** Editable state of one sprite variation. Images and steps are immutable values. */
export interface DocSnapshot {
  current: RgbaImage;
  pipeline: FilterStep[];
}

export interface DocHistory {
  undo: DocSnapshot[];
  redo: DocSnapshot[];
  /** Key of the last committed change; repeated changes with the same key coalesce (e.g. slider drags). */
  lastKey: string | null;
}

export const HISTORY_LIMIT = 100;

export const emptyHistory = (): DocHistory => ({ undo: [], redo: [], lastKey: null });

/** Records `before` as an undo point for a change. Same non-null key as the previous change → coalesced. */
export function commitChange(h: DocHistory, before: DocSnapshot, key: string | null = null): DocHistory {
  if (key !== null && key === h.lastKey && h.undo.length > 0) {
    return { undo: h.undo, redo: [], lastKey: key };
  }
  const undo = [...h.undo, before];
  if (undo.length > HISTORY_LIMIT) undo.splice(0, undo.length - HISTORY_LIMIT);
  return { undo, redo: [], lastKey: key };
}

export function undoChange(h: DocHistory, present: DocSnapshot): { history: DocHistory; present: DocSnapshot } | null {
  if (h.undo.length === 0) return null;
  const prev = h.undo[h.undo.length - 1];
  return { history: { undo: h.undo.slice(0, -1), redo: [...h.redo, present], lastKey: null }, present: prev };
}

export function redoChange(h: DocHistory, present: DocSnapshot): { history: DocHistory; present: DocSnapshot } | null {
  if (h.redo.length === 0) return null;
  const next = h.redo[h.redo.length - 1];
  return { history: { undo: [...h.undo, present], redo: h.redo.slice(0, -1), lastKey: null }, present: next };
}

/** Breaks coalescing so the next change creates its own undo step. */
export function sealHistory(h: DocHistory): DocHistory {
  return h.lastKey === null ? h : { ...h, lastKey: null };
}
