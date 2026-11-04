import { describe, expect, it } from 'vitest';
import { createImage } from '../../src/core/image';
import { createFilterStep } from '../../src/core/filters';
import { HISTORY_LIMIT, commitChange, emptyHistory, redoChange, sealHistory, undoChange, type DocSnapshot } from '../../src/renderer/src/store/docHistory';

const snap = (n: number): DocSnapshot => ({ current: createImage(8, 8, [n, 0, 0, 255]), pipeline: [] });

describe('undo/redo history', () => {
  it('undoes and redoes edits in order', () => {
    let h = emptyHistory();
    const s0 = snap(0);
    const s1 = snap(1);
    const s2 = snap(2);
    h = commitChange(h, s0); // s0 -> s1
    h = commitChange(h, s1); // s1 -> s2
    const u1 = undoChange(h, s2)!;
    expect(u1.present).toBe(s1);
    const u2 = undoChange(u1.history, u1.present)!;
    expect(u2.present).toBe(s0);
    expect(undoChange(u2.history, u2.present)).toBeNull();
    const r1 = redoChange(u2.history, u2.present)!;
    expect(r1.present).toBe(s1);
    const r2 = redoChange(r1.history, r1.present)!;
    expect(r2.present).toBe(s2);
    expect(redoChange(r2.history, r2.present)).toBeNull();
  });

  it('a new change clears the redo stack', () => {
    let h = commitChange(emptyHistory(), snap(0));
    const u = undoChange(h, snap(1))!;
    h = commitChange(u.history, u.present);
    expect(h.redo).toHaveLength(0);
  });

  it('coalesces consecutive changes with the same key (slider drags) into one step', () => {
    const s0 = snap(0);
    let h = commitChange(emptyHistory(), s0, 'param:a:amount');
    h = commitChange(h, snap(1), 'param:a:amount');
    h = commitChange(h, snap(2), 'param:a:amount');
    expect(h.undo).toHaveLength(1);
    expect(undoChange(h, snap(3))!.present).toBe(s0);
    h = commitChange(h, snap(4), 'param:b:amount');
    expect(h.undo).toHaveLength(2);
    h = commitChange(sealHistory(h), snap(5), 'param:b:amount');
    expect(h.undo).toHaveLength(3);
  });

  it('tracks filter pipeline changes like pixel edits', () => {
    const before: DocSnapshot = { current: createImage(8, 8), pipeline: [] };
    const h = commitChange(emptyHistory(), before);
    const after: DocSnapshot = { current: before.current, pipeline: [createFilterStep('outline')] };
    expect(undoChange(h, after)!.present.pipeline).toEqual([]);
  });

  it('caps memory use', () => {
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 25; i++) h = commitChange(h, snap(i % 255));
    expect(h.undo).toHaveLength(HISTORY_LIMIT);
  });
});
