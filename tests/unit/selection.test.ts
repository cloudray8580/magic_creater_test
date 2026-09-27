import { expect, it } from 'vitest';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import {
  selectArea,
  selectionBounds,
  transformSelection,
  deleteSelection,
} from '../../src/shared/adventure/selection.js';
import { createHistory, changeHistory, undoHistory, redoHistory } from '../../src/shared/game.js';
const area = (
  doc: ReturnType<typeof adventureTemplate>,
  layer: 'objects' | 'terrain' | 'decoration',
  x: number,
  y: number,
  x2 = x,
  y2 = y,
) => selectArea(doc, doc.rooms[0].id, layer, { x, y }, { x: x2, y: y2 });
it('selects intersecting footprints in either drag direction and only the chosen room/layer', () => {
  const d = adventureTemplate();
  const a = area(d, 'objects', 30, 13),
    b = area(d, 'objects', 31, 14, 30, 13);
  expect(a.objectIds).toEqual(['gate']);
  expect(b.objectIds).toEqual(a.objectIds);
  expect(area(d, 'decoration', 30, 13).objectIds).toEqual([]);
  expect(area(d, 'objects', 2, 12).includesStart).toBe(true);
  expect(area(d, 'terrain', -9, 14, 1, 99).tiles).toHaveLength(4);
  expect(selectionBounds(d, area(d, 'objects', 99, 99))).toBeNull();
  expect(() => selectArea(d, 'missing', 'objects', { x: 0, y: 0 }, { x: 1, y: 1 })).toThrow(/房间/);
});
it('moves a group and its route as one reversible edit without touching other layers', () => {
  const d = adventureTemplate('moving-bridge');
  const s = area(d, 'objects', 14, 12, 20, 13);
  const result = transformSelection(d, s, 0, -3, false);
  expect(result.document.rooms[0].objects.find((o) => o.id === 'bridge')).toMatchObject({
    x: 16,
    y: 10,
    route: { x: 24, y: 10 },
  });
  expect(result.document.rooms[0].objects.find((o) => o.id === 'rest')?.y).toBe(10);
  expect(result.document.rooms[0].tiles).toEqual(d.rooms[0].tiles);
  const h = changeHistory(createHistory(d), result.document);
  expect(h.past).toHaveLength(1);
  expect(undoHistory(h).present).toEqual(d);
  expect(redoHistory(undoHistory(h)).present).toEqual(result.document);
});
it('copies internal links to fresh objects while retaining external sources, flags and portal destinations', () => {
  const d = adventureTemplate('forest-letter');
  const r = d.rooms[0];
  r.objects = [];
  r.tiles = [];
  d.start = { roomId: r.id, x: 1, y: 1 };
  d.flags = ['event'];
  r.objects.push(
    { id: 'item', kind: 'collectible', x: 2, y: 2 },
    { id: 'lever', kind: 'switch', x: 3, y: 2 },
    {
      id: 'gate',
      kind: 'door',
      x: 4,
      y: 2,
      condition: { mode: 'any', sources: ['item', 'lever', 'flag:event'] },
    },
    {
      id: 'friend',
      kind: 'npc',
      x: 5,
      y: 2,
      dialogue: [
        {
          id: 'a',
          text: 'hi',
          condition: { mode: 'all', sources: ['item'] },
          choices: [{ label: 'give', giveItem: 'item', takeItem: 'item', setFlag: 'event' }],
        },
        { id: 'b', text: 'default', choices: [] },
      ],
    },
    { id: 'port', kind: 'portal', x: 6, y: 2, target: { roomId: r.id, x: 1, y: 1 } },
  );
  // Remove unrelated room references from the original template.
  d.rooms = [r];
  const s = area(d, 'objects', 1, 1, 6, 2),
    result = transformSelection(d, s, 0, 4, true);
  expect(result.document.start).toEqual(d.start);
  expect(result.selection.includesStart).toBe(false);
  const copies = result.document.rooms[0].objects.filter((o) =>
    result.selection.objectIds.includes(o.id),
  );
  const item = copies.find((o) => o.kind === 'collectible')!,
    lever = copies.find((o) => o.kind === 'switch')!;
  expect(item.id).not.toBe('item');
  expect(copies.find((o) => o.kind === 'door')?.condition?.sources).toEqual([
    item.id,
    lever.id,
    'flag:event',
  ]);
  expect(copies.find((o) => o.kind === 'npc')?.dialogue?.[0]).toMatchObject({
    condition: { sources: [item.id] },
    choices: [{ giveItem: item.id, takeItem: item.id, setFlag: 'event' }],
  });
  expect(copies.find((o) => o.kind === 'portal')?.target).toEqual({ roomId: r.id, x: 1, y: 1 });
  const gateOnly = transformSelection(d, area(d, 'objects', 4, 2), 0, 5, true);
  expect(gateOnly.document.rooms[0].objects.at(-1)?.condition?.sources).toEqual([
    'item',
    'lever',
    'flag:event',
  ]);
});
it('rejects all of a move/copy for bounds, route endpoints, occupied destinations and stale selection', () => {
  const d = adventureTemplate('moving-bridge'),
    before = JSON.stringify(d);
  const s = area(d, 'objects', 16, 13);
  expect(() => transformSelection(d, s, 21, 0, false)).toThrow(/范围/);
  expect(() => transformSelection(d, s, 0, 0, true)).toThrow(/已有/);
  expect(() => transformSelection(d, s, 13, 0, false)).toThrow(/已有/);
  expect(() => transformSelection(d, s, 0.5, 0, false)).toThrow(/整数/);
  const stale = structuredClone(s);
  stale.objectIds = ['missing'];
  expect(() => transformSelection(d, stale, 0, -1, false)).toThrow(/重新框选/);
  expect(JSON.stringify(d)).toBe(before);
});
it('moves overlapping terrain atomically but rejects overwriting unselected terrain', () => {
  const d = adventureTemplate();
  d.rooms[0].tiles = [
    { x: 1, y: 1, kind: 'solid' },
    { x: 2, y: 1, kind: 'water' },
    { x: 5, y: 1, kind: 'solid' },
  ];
  const s = area(d, 'terrain', 1, 1, 2, 1),
    m = transformSelection(d, s, 1, 0, false);
  expect(m.document.rooms[0].tiles).toEqual(
    expect.arrayContaining([
      { x: 2, y: 1, kind: 'solid' },
      { x: 3, y: 1, kind: 'water' },
    ]),
  );
  expect(() => transformSelection(d, s, 3, 0, false)).toThrow(/已有/);
  const copied = transformSelection(d, s, 0, 1, true);
  expect(copied.document.rooms[0].tiles).toHaveLength(5);
  expect(deleteSelection(d, s).rooms[0].tiles).toEqual([{ x: 5, y: 1, kind: 'solid' }]);
});
it('moves the unique start, skips it when copying and confirms only external references on delete', () => {
  const d = adventureTemplate();
  const start = area(d, 'objects', 2, 12);
  expect(transformSelection(d, start, 1, 0, false).document.start).toEqual({
    roomId: 'trail',
    x: 3,
    y: 12,
  });
  expect(() => transformSelection(d, start, 1, 0, true)).toThrow(/起点/);
  expect(deleteSelection(d, start).start).toBeNull();
  const lever = area(d, 'objects', 24, 13);
  expect(() => deleteSelection(d, lever)).toThrow(/引用/);
  expect(
    deleteSelection(d, lever, true).rooms[0].objects.find((o) => o.id === 'gate')?.condition
      ?.sources,
  ).toEqual([]);
  const both = area(d, 'objects', 24, 12, 30, 13);
  expect(() => deleteSelection(d, both)).not.toThrow();
  const empty = area(d, 'objects', 0, 0);
  expect(() => transformSelection(d, empty, 1, 0, false)).toThrow(/为空/);
  expect(() => deleteSelection(d, empty)).toThrow(/为空/);
});
