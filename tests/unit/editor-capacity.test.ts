import { it, expect } from 'vitest';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { validateCreative, DOCUMENT_BYTES } from '../../src/shared/creative.js';
import { updateObject } from '../../src/shared/adventure/editor.js';
it('rejects an edit that crosses the UTF-8 byte budget without altering the previous recoverable document', () => {
  const doc = adventureTemplate();
  doc.start = null;
  const room = doc.rooms[0];
  room.width = 128;
  room.height = 32;
  room.tiles = Array.from({ length: 4096 }, (_, i) => ({
    x: i % 128,
    y: Math.floor(i / 128),
    kind: 'solid' as const,
  }));
  room.objects = Array.from({ length: 300 }, (_, i) => ({
    id: 'note-' + i,
    kind: 'sign' as const,
    x: i % 128,
    y: Math.floor(i / 128),
    text: 'x',
  }));
  const target = DOCUMENT_BYTES - 200;
  for (const o of room.objects.slice(1)) {
    const n = Math.min(720, target - Buffer.byteLength(JSON.stringify(doc)) + 1);
    if (n <= 0) break;
    o.text = '界'.repeat(Math.floor(n / 3)) + 'x'.repeat(n % 3);
  }
  validateCreative(doc);
  const before = JSON.stringify(doc);
  expect(() => updateObject(doc, 'note-0', { text: '界'.repeat(240) })).toThrow('容量');
  expect(JSON.stringify(doc)).toBe(before);
  expect(validateCreative(doc)).toEqual(doc);
});
