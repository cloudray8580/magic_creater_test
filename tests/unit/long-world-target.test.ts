import { it, expect } from 'vitest';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { createHistory, changeHistory, undoHistory, redoHistory } from '../../src/shared/game.js';
import { validateCreative } from '../../src/shared/creative.js';
import { resizeRoom, strokeCells, paintWorld } from '../../src/shared/adventure/editor.js';
it('supports the final 2048x64, 16384 tile and 600 object budgets while rejecting excess', () => {
  const d = adventureTemplate();
  d.start = null;
  const r = d.rooms[0];
  r.width = 2048;
  r.height = 64;
  r.tiles = Array.from({ length: 16384 }, (_, i) => ({
    x: i % 2048,
    y: Math.floor(i / 2048),
    kind: 'solid' as const,
  }));
  r.objects = Array.from({ length: 600 }, (_, i) => ({
    id: 'flower-' + i,
    kind: 'decoration' as const,
    x: i,
    y: 20,
    skin: 'flower',
  }));
  expect(() => validateCreative(d)).not.toThrow();
  expect(strokeCells({ x: 0, y: 30 }, { x: 2047, y: 30 })).toHaveLength(2048);
  expect(() => resizeRoom(d, r.id, 2049, 64)).toThrow();
  const over = structuredClone(d);
  over.rooms[0].objects.push({ ...r.objects[0], id: 'extra' });
  expect(() => validateCreative(over)).toThrow();
  over.rooms[0].objects.pop();
  over.rooms[0].tiles.push({ x: 0, y: 8, kind: 'solid' });
  expect(() => validateCreative(over)).toThrow();
});
it('gives bridge, rooftop, lighthouse and cottage distinct mechanics', () => {
  const bridge = adventureTemplate('moving-bridge').rooms[0];
  expect(bridge.tiles.some((t) => t.y === 14 && t.x === 25)).toBe(false);
  expect(bridge.objects.some((o) => o.kind === 'spring')).toBe(false);
  const roof = adventureTemplate('rooftop-secret').rooms[0];
  expect(roof.width).toBe(30);
  expect(roof.objects.some((o) => o.kind === 'door')).toBe(false);
  const light = adventureTemplate('lighthouse').rooms[0];
  expect(light.objects.filter((o) => o.kind === 'switch')).toHaveLength(2);
  expect(light.objects.find((o) => o.kind === 'door')!.condition?.sources).toHaveLength(2);
  const home = adventureTemplate('secret-home').rooms[0];
  expect(
    home.objects.some((o) => o.kind === 'box' || o.kind === 'plate' || o.kind === 'door'),
  ).toBe(false);
  expect(home.objects.find((o) => o.id === 'gift')!.required).toBe(false);
  expect(home.objects.find((o) => o.id === 'host')!.dialogue).toHaveLength(2);
});

it('commits a 2048-cell brush in one history step and rejects each over-budget edit without changing the source', () => {
  const d = resizeRoom(adventureTemplate(), 'trail', 2048, 64);
  const before = JSON.stringify(d);
  const painted = paintWorld(
    d,
    'trail',
    strokeCells({ x: 0, y: 30 }, { x: 2047, y: 30 }),
    'solid',
    'terrain',
  );
  const h = changeHistory(createHistory(d), painted);
  expect(h.past).toHaveLength(1);
  expect(undoHistory(h).present).toEqual(d);
  expect(redoHistory(undoHistory(h)).present).toEqual(painted);
  expect(painted.rooms[0].tiles.filter((t) => t.y === 30)).toHaveLength(2048);
  expect(JSON.stringify(d)).toBe(before);
  d.start = null;
  d.rooms[0].tiles = Array.from({ length: 16384 }, (_, i) => ({
    x: i % 2048,
    y: Math.floor(i / 2048),
    kind: 'solid',
  }));
  d.rooms[0].objects = Array.from({ length: 600 }, (_, i) => ({
    id: 'flower-' + i,
    kind: 'decoration',
    skin: 'flower',
    x: i,
    y: 20,
  }));
  const full = JSON.stringify(d);
  expect(() => paintWorld(d, 'trail', [{ x: 1900, y: 30 }], 'solid', 'terrain')).toThrow();
  expect(JSON.stringify(d)).toBe(full);
  expect(() => paintWorld(d, 'trail', [{ x: 1900, y: 30 }], 'flower', 'decoration')).toThrow();
  expect(JSON.stringify(d)).toBe(full);
});
