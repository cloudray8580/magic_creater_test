import { it, expect } from 'vitest';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { validateCreative, DOCUMENT_BYTES } from '../../src/shared/creative.js';
import {
  resizeRoom,
  paintWorld,
  strokeCells,
  copyObject,
} from '../../src/shared/adventure/editor.js';
import { createHistory, changeHistory, undoHistory, redoHistory } from '../../src/shared/game.js';
import { roomIndex } from '../../src/shared/adventure/spatial.js';
it('expands a platform map to 512x64 with an atomic long brush and rejects crop without mutating', () => {
  const original = adventureTemplate();
  const d = resizeRoom(original, 'trail', 512, 64);
  expect(DOCUMENT_BYTES).toBe(1024 * 1024);
  expect(original.rooms[0].width).toBe(42);
  const next = paintWorld(
    d,
    'trail',
    strokeCells({ x: 0, y: 30 }, { x: 511, y: 30 }),
    'solid',
    'terrain',
  );
  expect(next.rooms[0].tiles.filter((t) => t.y === 30)).toHaveLength(512);
  expect(() => resizeRoom(next, 'trail', 64, 64)).toThrow('裁切');
  expect(next.rooms[0].width).toBe(512);
  expect(() => resizeRoom(next, 'trail', 513, 64)).toThrow();
  const story = adventureTemplate('forest-letter');
  expect(() => resizeRoom(story, story.rooms[0].id, 33, 24)).toThrow();
});
it('accepts the platform tile budget while retaining the story budget', () => {
  const d = adventureTemplate();
  d.start = null;
  const r = d.rooms[0];
  r.width = 512;
  r.height = 64;
  r.tiles = Array.from({ length: 8192 }, (_, i) => ({
    x: i % 512,
    y: Math.floor(i / 512),
    kind: 'solid' as const,
  }));
  expect(() => validateCreative(d)).not.toThrow();
  r.tiles.push({ x: 0, y: 16, kind: 'solid' });
  expect(() => validateCreative(d)).toThrow('地形');
});
it('indexes tile neighbors and queries only intersecting cells across chunk boundaries', () => {
  const d = resizeRoom(adventureTemplate(), 'trail', 512, 64),
    r = d.rooms[0];
  r.tiles = [
    { x: 31, y: 30, kind: 'solid' },
    { x: 32, y: 30, kind: 'oneway' },
    { x: 511, y: 63, kind: 'water' },
  ];
  const grid = roomIndex(r);
  expect(grid.at(32, 30)?.kind).toBe('oneway');
  expect(grid.query({ x: 30, y: 29, width: 3, height: 2 })).toEqual(r.tiles.slice(0, 2));
  expect(grid.query({ x: -10, y: -10, width: 2, height: 2 })).toEqual([]);
  expect(grid.query({ x: 510, y: 62, width: 2, height: 2 })).toEqual([r.tiles[2]]);
  expect(roomIndex(r)).toBe(grid);
});
it('keeps 100 reversible edits while sharing unchanged map data and isolating caller mutation', () => {
  const d = adventureTemplate();
  let h = createHistory(d);
  const tiles = h.present.rooms[0].tiles;
  for (let i = 1; i <= 100; i++) h = changeHistory(h, { ...h.present, title: '创作' + i });
  expect(h.past).toHaveLength(100);
  expect(h.present.rooms[0].tiles).toBe(tiles);
  const input = { ...h.present, title: '新名称' };
  h = changeHistory(h, input);
  input.title = '意外变化';
  expect(h.present.title).toBe('新名称');
  for (let i = 0; i < 100; i++) h = undoHistory(h);
  expect(h.present.title).toBe('创作1');
  for (let i = 0; i < 100; i++) h = redoHistory(h);
  expect(h.present.title).toBe('新名称');
  const copied = copyObject(
    resizeRoom(d, 'trail', 512, 64),
    d.rooms[0].objects.find((o) => o.kind === 'sign')!.id,
  );
  expect(copied.document.rooms[0].objects.find((o) => o.id === copied.id)).toBeDefined();
});

it('retains newly added empty dialogue arrays in immutable history', () => {
  const h = createHistory({ objects: [] as { dialogue: { choices: string[] }[] }[] });
  const next = { objects: [{ dialogue: [{ choices: [] as string[] }] }] };
  const changed = changeHistory(h, next);
  expect(changed.present).toEqual(next);
  next.objects[0].dialogue[0].choices.push('later');
  expect(changed.present.objects[0].dialogue[0].choices).toEqual([]);
});
it('shares unmodified cells across actual painting, erasing and 100 histories', () => {
  const d = resizeRoom(adventureTemplate(), 'trail', 512, 64);
  d.start = null;
  d.rooms[0].tiles = Array.from({ length: 8192 }, (_, i) => ({
    x: i % 512,
    y: Math.floor(i / 512),
    kind: 'solid' as const,
  }));
  let h = createHistory(d);
  const untouched = h.present.rooms[0].tiles[8191];
  for (let i = 0; i < 100; i++)
    h = changeHistory(h, paintWorld(h.present, 'trail', [{ x: i, y: 0 }], 'water', 'terrain'));
  expect(h.present.rooms[0].tiles[8191]).toBe(untouched);
  const unique = new Set([...h.past, h.present].flatMap((doc) => doc.rooms[0].tiles));
  expect(unique.size).toBe(8292);
  h = changeHistory(h, paintWorld(h.present, 'trail', [{ x: 0, y: 0 }], 'erase', 'terrain'));
  expect(h.present.rooms[0].tiles.at(-1)).toBe(untouched);
  const snapshot = JSON.stringify(h.present);
  expect(JSON.stringify(redoHistory(undoHistory(h)).present)).toBe(snapshot);
});
