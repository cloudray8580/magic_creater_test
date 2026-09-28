import { describe, expect, it } from 'vitest';
import { snowmanTemplate } from '../../src/shared/snowman/template.js';
import { createRun, advance, perform, replay, liveRoute } from '../../src/shared/snowman/engine.js';
import type { SnowmanDocument } from '../../src/shared/snowman/document.js';

function path(): SnowmanDocument {
  const d = snowmanTemplate();
  d.width = 8;
  d.height = 8;
  d.start = { x: 0, y: 1 };
  d.home = { x: 4, y: 1 };
  d.cells = Array.from({ length: 5 }, (_, x) => ({
    x,
    y: 1,
    kind: x === 2 ? 'gap' : 'road',
  }));
  d.pickups = [
    { x: 1, y: 1, kind: 'hat', style: 'berry' },
    { x: 3, y: 1, kind: 'hat', style: 'pine' },
  ];
  d.mass = 8;
  d.preparationSeconds = 3;
  d.materials = { wood: 2, water: 0, signs: 0, snowballs: 1 };
  return d;
}

describe('live snowman journey', () => {
  it('counts three preparation seconds, moves to a broken frontier, then follows a live bridge', () => {
    const d = path();
    const s = createRun(d);
    advance(s, 119);
    expect(s.phase).toBe('prep');
    advance(s);
    expect(s.phase).toBe('run');
    advance(s, 27);
    expect(s.cell).toEqual({ x: 1, y: 1 });
    advance(s, 30);
    expect(s.cell).toEqual({ x: 1, y: 1 });
    expect(s.mass).toBeLessThan(8);
    perform(s, { type: 'place', tool: 'bridge', x: 2, y: 1 });
    advance(s, 100);
    expect(s.phase).toBe('won');
    expect(s.hats).toEqual(['berry', 'pine']);
    expect(s.mass).toBeGreaterThan(0);
    expect(replay(d, s.actions).status).toBe('won');
  });
  it('places a limited snowball ahead; pickup restores mass but cannot revive a melted snowman', () => {
    const d = path();
    d.cells[2].kind = 'road';
    d.pickups = [];
    d.preparationSeconds = 0;
    d.mass = 2;
    const s = createRun(d);
    perform(s, { type: 'place', tool: 'snowball', x: 1, y: 1 });
    expect(s.inventory.snowballs).toBe(0);
    advance(s, 27);
    expect(s.mass).toBeGreaterThan(2);
    expect(s.mass).toBeLessThanOrEqual(3);
    expect(replay(d, s.actions).status).toBe('won');
    const late = createRun(d);
    advance(late, 120);
    expect(late.phase).toBe('lost');
    expect(() => perform(late, { type: 'place', tool: 'snowball', x: 1, y: 1 })).toThrow();
  });
  it('keeps every hat style in route order beyond the old twelve-hat display limit', () => {
    const d = path();
    d.width = 20;
    d.home = { x: 17, y: 1 };
    d.cells = Array.from({ length: 18 }, (_, x) => ({ x, y: 1, kind: 'road' }));
    d.pickups = Array.from({ length: 16 }, (_, i) => ({
      x: i + 1,
      y: 1,
      kind: 'hat',
      style: i % 2 ? 'pine' : 'berry',
    }));
    d.preparationSeconds = 0;
    d.mass = 30;
    const s = createRun(d);
    advance(s, 1000);
    expect(s.phase).toBe('won');
    expect(s.hats).toHaveLength(16);
    expect(s.hats.slice(0, 4)).toEqual(['berry', 'pine', 'berry', 'pine']);
  });
  it('bounds server route search work on untrusted large maps', () => {
    const d = path();
    const s = createRun(d);
    expect(s.searchLimit).toBe(5_000_000);
    s.searchLimit = 2;
    expect(liveRoute(s, false)).toHaveLength(5);
    expect(s.searchWork).toBe(0);
    expect(() => liveRoute(s)).toThrow('路线搜索超出预算');
  });
  it('refunds an unused sign and keeps the route choice deterministic', () => {
    const d = path();
    d.cells[2].kind = 'road';
    d.materials.signs = 1;
    const s = createRun(d);
    perform(s, { type: 'place', tool: 'sign', x: 1, y: 1, direction: 'right' });
    expect(s.inventory.signs).toBe(0);
    perform(s, { type: 'remove', tool: 'sign', x: 1, y: 1 });
    expect(s.inventory.signs).toBe(1);
    expect(replay(d, s.actions).status).toBe('won');
  });
  it('freezes an edge already in motion and refunds only unused placed materials', () => {
    const d = path();
    d.preparationSeconds = 0;
    const s = createRun(d);
    perform(s, { type: 'place', tool: 'bridge', x: 2, y: 1 });
    perform(s, { type: 'remove', tool: 'bridge', x: 2, y: 1 });
    expect(s.inventory.wood).toBe(2);
    perform(s, { type: 'place', tool: 'bridge', x: 2, y: 1 });
    advance(s, 55);
    expect(() => perform(s, { type: 'remove', tool: 'bridge', x: 2, y: 1 })).toThrow();
  });
});
