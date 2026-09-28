import { describe, expect, it } from 'vitest';
import { validateSnowman, type SnowmanDocument } from '../../src/shared/snowman/document.js';
import { createRun, advance, perform, replay, liveRoute } from '../../src/shared/snowman/engine.js';
import { snowmanTemplate } from '../../src/shared/snowman/template.js';

function line(length = 6): SnowmanDocument {
  const d = snowmanTemplate();
  d.width = Math.max(8, length);
  d.height = 8;
  d.start = { x: 0, y: 1 };
  d.home = { x: length - 1, y: 1 };
  d.cells = Array.from({ length }, (_, x) => ({ x, y: 1, kind: 'road' }));
  d.pickups = [];
  d.preparationSeconds = 0;
  d.mass = 10;
  return d;
}
describe('snowman document and shared rules', () => {
  it('validates large maps and normalizes experimental V1 hats and missing settings', () => {
    const d = line();
    expect(validateSnowman(d, true)).toEqual(d);
    const old = {
      ...d,
      rulesVersion: 1,
      cells: [{ x: 0, y: 1, kind: 'road' }, { x: 1, y: 1, kind: 'hat' }, ...d.cells.slice(2)],
      materials: { wood: 1, water: 1, signs: 1 },
    };
    delete (old as Record<string, unknown>).pickups;
    delete (old as Record<string, unknown>).preparationSeconds;
    const normalized = validateSnowman(old, true);
    expect(normalized.rulesVersion).toBe(2);
    expect(normalized.pickups).toEqual([{ x: 1, y: 1, kind: 'hat', style: 'berry' }]);
    expect(normalized.preparationSeconds).toBe(3);
    expect(normalized.materials.snowballs).toBe(0);
    expect(() => validateSnowman({ ...d, width: 129 })).toThrow();
    expect(() => validateSnowman({ ...d, cells: [...d.cells, d.cells[0]] })).toThrow();
    expect(() =>
      validateSnowman({
        ...d,
        pickups: [
          { x: 1, y: 1, kind: 'hat', style: 'berry' },
          { x: 1, y: 1, kind: 'snowball' },
        ],
      }),
    ).toThrow();
    expect(() => validateSnowman({ ...d, pickups: [{ x: 7, y: 7, kind: 'snowball' }] })).toThrow();
    expect(() => validateSnowman({ ...d, preparationSeconds: undefined })).toThrow();
    expect(() =>
      validateSnowman({
        ...d,
        materials: {
          wood: 1,
          water: 1,
          signs: 1,
        },
      }),
    ).toThrow();
    expect(() => validateSnowman({ ...d, unexpected: 1 })).toThrow();
    expect(() => validateSnowman({ ...d, home: null }, true)).toThrow();
    d.width = 128;
    d.height = 128;
    expect(validateSnowman(d, true).width).toBe(128);
  });
  it('repairs a broken road, extinguishes fire, and rejects over-budget or false proof', () => {
    const d = line();
    d.cells[2].kind = 'broken';
    d.cells[3].kind = 'fire';
    d.materials = { wood: 1, water: 1, signs: 0, snowballs: 0 };
    d.mass = 5;
    const s = createRun(d);
    expect(() => perform(s, { type: 'place', tool: 'bridge', x: 2, y: 1 })).toThrow();
    perform(s, { type: 'place', tool: 'repair', x: 2, y: 1 });
    expect(() => perform(s, { type: 'place', tool: 'skis', x: 1, y: 1 })).toThrow();
    perform(s, { type: 'place', tool: 'water', x: 3, y: 1 });
    advance(s, 300);
    expect(s.phase).toBe('won');
    expect(replay(d, s.actions).status).toBe('won');
    expect(replay(d, []).status).toBe('lost');
    expect(() =>
      replay(d, [{ tick: 0, action: { type: 'place', tool: 'repair', x: 2, y: 1, mass: 999 } }]),
    ).toThrow();
  });
  it('uses directed signs and stable right, down, left, up tie order', () => {
    const d = line();
    for (let x = 0; x < 6; x++) d.cells.push({ x, y: 2, kind: 'road' });
    d.materials.signs = 1;
    d.preparationSeconds = 3;
    const s = createRun(d);
    expect(liveRoute(s)[1]).toEqual({ x: 1, y: 1 });
    perform(s, { type: 'place', tool: 'sign', x: 0, y: 1, direction: 'down' });
    expect(liveRoute(s)[1]).toEqual({ x: 0, y: 2 });
    advance(s, 620);
    expect(s.phase).toBe('won');
    const loop = createRun(d);
    perform(loop, { type: 'place', tool: 'sign', x: 0, y: 1, direction: 'left' });
    advance(loop, 1000);
    expect(loop.phase).toBe('lost');
  });
  it('shade slows melting, ice speeds movement, and fire causes faster melting', () => {
    const d = line(8);
    d.mass = 2;
    const plain = createRun(d);
    advance(plain, 40);
    d.cells[1].kind = 'shade';
    const shade = createRun(d);
    advance(shade, 40);
    expect(shade.mass).toBeGreaterThan(plain.mass);
    d.cells[1].kind = 'ice';
    const ice = createRun(d);
    advance(ice, 40);
    expect(ice.progress).toBeGreaterThan(plain.progress);
    d.cells[1].kind = 'fire';
    const fire = createRun(d);
    advance(fire, 40);
    expect(fire.phase).toBe('lost');
  });
  it('handles 128 by 128 map without changing the original document', () => {
    const d = line();
    d.width = 128;
    d.height = 128;
    d.start = { x: 0, y: 0 };
    d.home = { x: 127, y: 127 };
    d.cells = [];
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) d.cells.push({ x, y, kind: 'road' });
    d.mass = 300;
    const before = JSON.stringify(d);
    const s = createRun(d);
    expect(liveRoute(s)).toHaveLength(255);
    advance(s, 10000);
    expect(s.phase).toBe('won');
    expect(s.searchWork).toBeLessThan(40000);
    expect(JSON.stringify(d)).toBe(before);
  });
});
