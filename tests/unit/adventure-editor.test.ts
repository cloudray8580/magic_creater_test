import { describe, expect, it } from 'vitest';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import {
  paintWorld,
  moveObject,
  copyObject,
  removeObject,
  updateObject,
  resizeRoom,
  referencesTo,
  strokeCells,
} from '../../src/shared/adventure/editor.js';
const room = 'trail';
describe('C32 atomic map editing', () => {
  it('paints continuous terrain strokes without erasing objects or mutating originals', () => {
    const doc = adventureTemplate();
    const before = JSON.stringify(doc);
    const cells = strokeCells({ x: 0, y: 2 }, { x: 5, y: 2 });
    expect(cells).toHaveLength(6);
    const painted = paintWorld(doc, room, cells, 'solid', 'terrain');
    expect(painted.rooms[0].tiles.filter((t) => t.y === 2)).toHaveLength(6);
    expect(painted.rooms[0].objects).toEqual(doc.rooms[0].objects);
    expect(JSON.stringify(doc)).toBe(before);
    const erased = paintWorld(painted, room, [{ x: 3, y: 2 }], 'erase', 'terrain');
    expect(erased.rooms[0].tiles.filter((t) => t.y === 2)).toHaveLength(5);
    expect(() =>
      paintWorld(
        doc,
        room,
        [
          { x: 1, y: 2 },
          { x: 999, y: 2 },
        ],
        'solid',
        'terrain',
      ),
    ).toThrow(/范围/);
  });
  it('keeps layers separate, unique spawn, and rejects implicit entity overwrite', () => {
    let doc = adventureTemplate();
    doc = paintWorld(doc, room, [{ x: 2, y: 3 }], 'switch', 'objects');
    expect(() => paintWorld(doc, room, [{ x: 2, y: 3 }], 'door', 'objects')).toThrow(/已有/);
    doc = paintWorld(doc, room, [{ x: 2, y: 3 }], 'tree', 'decoration');
    expect(doc.rooms[0].objects.filter((o) => o.x === 2 && o.y === 3)).toHaveLength(2);
    doc = paintWorld(doc, room, [{ x: 5, y: 5 }], 'spawn', 'objects');
    expect(doc.start).toEqual({ roomId: room, x: 5, y: 5 });
  });
  it('protects linked deletion and clears references only on explicit confirmation', () => {
    const doc = adventureTemplate();
    expect(referencesTo(doc, 'lantern-switch')).toContain('gate');
    expect(() => removeObject(doc, 'lantern-switch')).toThrow(/引用/);
    expect(() => paintWorld(doc, room, [{ x: 24, y: 13 }], 'erase', 'objects')).toThrow(/引用/);
    const cleared = removeObject(doc, 'lantern-switch', true);
    expect(cleared.rooms[0].objects.find((o) => o.id === 'gate')!.condition!.sources).toEqual([]);
    expect(cleared.rooms[0].objects.some((o) => o.id === 'lantern-switch')).toBe(false);
  });
  it('copies unique identity with explicit link preservation and moves routes atomically', () => {
    const doc = adventureTemplate('moving-bridge');
    const copy = copyObject(doc, 'gate');
    expect(copy.id).not.toBe('gate');
    expect(copy.document.rooms[0].objects.find((o) => o.id === copy.id)?.condition).toEqual(
      doc.rooms[0].objects.find((o) => o.id === 'gate')!.condition,
    );
    const moved = moveObject(doc, 'bridge', 17, 12);
    expect(moved.rooms[0].objects.find((o) => o.id === 'bridge')!.route).toEqual({ x: 21, y: 12 });
    expect(() => moveObject(doc, 'bridge', 40, 12)).toThrow();
    expect(doc.rooms[0].objects.find((o) => o.id === 'bridge')!.x).toBe(16);
  });
  it('validates properties and map resizing without silently dropping content', () => {
    const doc = adventureTemplate();
    expect(
      updateObject(doc, 'gate', { height: 1 }).rooms[0].objects.find((o) => o.id === 'gate')!
        .height,
    ).toBe(1);
    expect(() => updateObject(doc, 'gate', { seconds: 8 })).toThrow(/字段/);
    expect(() =>
      updateObject(doc, 'gate', { condition: { mode: 'all', sources: ['missing'] } }),
    ).toThrow(/引用/);
    expect(() => resizeRoom(doc, room, 10, 16)).toThrow(/范围|超出/);
    expect(resizeRoom(doc, room, 50, 16).rooms[0].width).toBe(50);
    expect(strokeCells({ x: 1, y: 1 }, { x: 3, y: 3 })).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
  });
});

it('preserves the route shape when copying near an edge instead of shortening it', () => {
  let doc = adventureTemplate('moving-bridge');
  doc = updateObject(doc, 'bridge', { x: 35, route: { x: 39, y: 12 } });
  const source = doc.rooms[0].objects.find((o) => o.id === 'bridge')!;
  const copied = copyObject(doc, 'bridge');
  const copy = copied.document.rooms[0].objects.find((o) => o.id === copied.id)!;
  expect(copy.route!.x - copy.x).toBe(source.route!.x - source.x);
  expect(copy.route!.y - copy.y).toBe(source.route!.y - source.y);
});

it('treats the entire footprint as occupied for painting and erasing', () => {
  const doc = adventureTemplate();
  expect(() => paintWorld(doc, 'trail', [{ x: 30, y: 13 }], 'collectible', 'objects')).toThrow(
    /已有/,
  );
  const erased = paintWorld(doc, 'trail', [{ x: 30, y: 13 }], 'erase', 'objects');
  expect(erased.rooms[0].objects.some((o) => o.id === 'gate')).toBe(false);
});
