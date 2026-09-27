import { it, expect } from 'vitest';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { validateCreative, DOCUMENT_BYTES } from '../../src/shared/creative.js';
import { updateObject } from '../../src/shared/adventure/editor.js';
it('rejects an edit that crosses the UTF-8 byte budget without altering the previous recoverable document', () => {
  const doc = adventureTemplate('forest-letter');
  doc.start = null;
  doc.rooms.forEach((r) => (r.objects = []));
  const room = doc.rooms[0];
  room.objects = Array.from({ length: 200 }, (_, i) => ({
    id: 'writer-' + i,
    kind: 'npc',
    x: 4,
    y: 4,
    dialogue: Array.from({ length: 8 }, (_, j) => ({ id: 'page-' + j, text: 'x', choices: [] })),
  }));
  const target = DOCUMENT_BYTES - 200;
  for (const page of room.objects.flatMap((o) => o.dialogue!).slice(1)) {
    const n = Math.min(720, target - Buffer.byteLength(JSON.stringify(doc)) + 1);
    if (n <= 0) break;
    page.text = '界'.repeat(Math.floor(n / 3)) + (n % 3 === 2 ? 'é' : n % 3 === 1 ? 'x' : '');
  }
  expect(Buffer.byteLength(JSON.stringify(doc))).toBe(target);
  validateCreative(doc);
  const before = JSON.stringify(doc),
    dialogue = structuredClone(room.objects[0].dialogue!);
  dialogue[0].text = '界'.repeat(240);
  expect(() => updateObject(doc, 'writer-0', { dialogue })).toThrow('容量');
  expect(JSON.stringify(doc)).toBe(before);
  expect(validateCreative(doc)).toEqual(doc);
});
