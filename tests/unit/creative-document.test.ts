import { describe, expect, it } from 'vitest';
import { validateCreative, DOCUMENT_BYTES } from '../../src/shared/creative.js';
import {
  template,
  ValidationError,
  createHistory,
  changeHistory,
  undoHistory,
  redoHistory,
} from '../../src/shared/game.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
describe('C31 version dispatch and authored history', () => {
  it('preserves legacy and both new formats without conversion', () => {
    for (const doc of [template(), adventureTemplate(), adventureTemplate('forest-letter')]) {
      const output = validateCreative(doc, true);
      expect(output).toEqual(doc);
      expect(output).not.toBe(doc);
    }
  });
  it('normalizes malformed, unsupported and oversized content to readable validation errors', () => {
    for (const doc of [
      null,
      [],
      { schemaVersion: 9 },
      { ...adventureTemplate(), script: 'anything' },
    ])
      expect(() => validateCreative(doc)).toThrow(ValidationError);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => validateCreative(cyclic)).toThrow(ValidationError);
    expect(() =>
      validateCreative({ ...adventureTemplate(), description: 'a'.repeat(DOCUMENT_BYTES) }),
    ).toThrow(/容量/);
    const draft = adventureTemplate();
    draft.start = null;
    expect(validateCreative(draft)).toEqual(draft);
    expect(() => validateCreative(draft, true)).toThrow(/起点/);
  });
  it('supports new documents in isolated bounded undo/redo snapshots', () => {
    const doc = adventureTemplate();
    let h = createHistory(doc);
    doc.title = 'outside mutation';
    expect(h.present.title).toBe('云间邮差');
    for (let i = 0; i < 110; i++) h = changeHistory(h, { ...h.present, title: String(i) });
    expect(h.past).toHaveLength(100);
    h = undoHistory(h);
    expect(h.present.title).toBe('108');
    h = redoHistory(h);
    expect(h.present.title).toBe('109');
    h = changeHistory(undoHistory(h), { ...h.present, title: 'new branch' });
    expect(h.future).toEqual([]);
  });
});
