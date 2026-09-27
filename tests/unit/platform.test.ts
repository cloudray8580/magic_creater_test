import { describe, expect, it } from 'vitest';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import type { AdventureDocument, WorldObject } from '../../src/shared/adventure/document.js';
import {
  startPlatform,
  stepPlatform,
  platformAction,
  platformCondition,
  movingPosition,
  PLAYER,
  type PlatformSession,
  type PlatformInput,
} from '../../src/shared/adventure/platform.js';
function fixture(objects: WorldObject[] = []): AdventureDocument {
  const doc = adventureTemplate('cloud-post');
  doc.rooms = [
    {
      id: 'r',
      name: '跑道',
      width: 30,
      height: 16,
      ground: 'grass',
      tiles: Array.from({ length: 30 }, (_, x) => ({ x, y: 14, kind: 'solid' as const })),
      objects: [{ id: 'goal', kind: 'goal', x: 28, y: 13, ending: '到家啦' }, ...objects],
    },
  ];
  doc.start = { roomId: 'r', x: 2, y: 13 };
  return doc;
}
const still: PlatformInput = { move: 0, jump: false, interact: false };
function run(s: PlatformSession, frames: number, input: Partial<PlatformInput> = {}, fps = 60) {
  for (let i = 0; i < frames; i++) s = stepPlatform(s, { ...still, ...input }, 1 / fps);
  return s;
}
describe('C23 platform movement', () => {
  it('lands, accelerates, stops at walls, and does not mutate authored data', () => {
    const doc = fixture();
    doc.rooms[0].tiles.push({ x: 8, y: 13, kind: 'solid' });
    const before = JSON.stringify(doc);
    let s = run(startPlatform(doc), 30);
    expect(s.state.onGround).toBe(true);
    expect(s.state.y + PLAYER.height).toBeCloseTo(14, 4);
    s = run(s, 120, { move: 1 });
    expect(s.state.x + PLAYER.width).toBeCloseTo(8, 3);
    expect(s.state.vx).toBe(0);
    expect(JSON.stringify(doc)).toBe(before);
  });
  it('allows variable jump height, avoids repeated airborne jumps, and buffers landing input', () => {
    const base = run(startPlatform(fixture()), 20);
    let full = run(base, 20, { jump: true });
    let short = run(run(base, 2, { jump: true }), 18);
    expect(full.state.y).toBeLessThan(short.state.y - 0.5);
    full = run(full, 100, { jump: true });
    expect(full.state.onGround).toBe(true);
    let falling = run(base, 24, { jump: true });
    falling = run(falling, 1);
    for (
      let i = 0;
      i < 180 && (falling.state.vy < 0 || falling.state.y + PLAYER.height < 13.6);
      i++
    )
      falling = run(falling, 1);
    expect(falling.state.y + PLAYER.height).toBeGreaterThanOrEqual(13.6);
    const buffered = run(falling, 12, { jump: true });
    expect(buffered.state.vy).toBeLessThan(0);
    expect(buffered.state.y).toBeLessThan(13);
  });
  it('supports late edge jumping within the coyote window and finite fixed stepping', () => {
    const doc = fixture();
    doc.rooms[0].tiles = doc.rooms[0].tiles.filter((t) => t.x < 5);
    let s = run(startPlatform(doc), 20);
    for (let i = 0; i < 180 && s.state.x < 4.9; i++) s = run(s, 1, { move: 1 });
    expect(s.state.x).toBeGreaterThanOrEqual(4.9);
    s = run(s, 2, { move: 1 });
    expect(s.state.onGround).toBe(false);
    s = run(s, 1, { move: 1, jump: true });
    expect(s.state.vy).toBeLessThan(0);
    expect(stepPlatform(s, still, NaN)).toEqual(s);
    expect(stepPlatform(s, still, -1)).toEqual(s);
  });
  it('gives the same simulation result at 30, 60 and 120 render fps', () => {
    const doc = fixture();
    const a = run(startPlatform(doc), 60, { move: 1 }, 30);
    const b = run(startPlatform(doc), 120, { move: 1 }, 60);
    const c = run(startPlatform(doc), 240, { move: 1 }, 120);
    expect(a.state.x).toBeCloseTo(b.state.x, 6);
    expect(c.state.x).toBeCloseTo(b.state.x, 6);
  });
  it('passes upwards through a one-way tile and lands on top', () => {
    const doc = fixture();
    doc.rooms[0].tiles.push({ x: 2, y: 11, kind: 'oneway' });
    let s = run(startPlatform(doc), 20);
    s = run(s, 65, { jump: true });
    expect(s.state.onGround).toBe(true);
    expect(s.state.y + PLAYER.height).toBeCloseTo(11, 3);
  });
  it('rides a moving platform and repeats the configured route', () => {
    const mover: WorldObject = {
      id: 'bridge',
      kind: 'mover',
      x: 2,
      y: 10,
      width: 3,
      route: { x: 8, y: 10 },
      speed: 'slow',
    };
    const doc = fixture([mover]);
    doc.start = { roomId: 'r', x: 3, y: 8 };
    const a = run(startPlatform(doc), 70),
      b = run(a, 60);
    expect(a.state.groundId).toBe('bridge');
    expect(b.state.x).toBeGreaterThan(a.state.x + 0.5);
    expect(movingPosition(mover, 0)).toEqual({ x: 2, y: 10 });
    expect(movingPosition(mover, 12)).toEqual({ x: 2, y: 10 });
  });
});
describe('C23 platform objectives and recovery', () => {
  it('restores the complete checkpoint snapshot on a hazard, including collectibles and switches', () => {
    const doc = fixture([
      { id: 'before', kind: 'collectible', x: 3, y: 13 },
      { id: 'switch-before', kind: 'switch', x: 2, y: 13 },
      { id: 'switch-after', kind: 'switch', x: 7, y: 13 },
      { id: 'cp', kind: 'checkpoint', x: 5, y: 13 },
      { id: 'after', kind: 'collectible', x: 7, y: 13 },
      { id: 'danger', kind: 'hazard', x: 10, y: 13 },
    ]);
    let s = run(startPlatform(doc), 20);
    s = run(s, 1, { interact: true });
    for (let i = 0; i < 100 && s.state.x < 6.5; i++) s = run(s, 1, { move: 1 });
    s = run(s, 1, { interact: true });
    expect(s.state.switches['switch-after']).toBe(-1);
    for (let i = 0; i < 240 && s.state.deaths === 0; i++) s = run(s, 1, { move: 1 });
    expect(s.state.deaths).toBe(1);
    expect(s.state.collected).toContain('before');
    expect(s.state.collected).not.toContain('after');
    expect(s.state.x).toBeGreaterThan(4);
    expect(s.state.x).toBeLessThan(6);
    expect(s.state.checkpointId).toBe('cp');
    expect(s.state.switches['switch-before']).toBe(-1);
    expect(s.state.switches['switch-after']).toBeUndefined();
    expect(platformAction(s, 'restart').state.collected).toEqual([]);
  });
  it('requires essential collectibles but permits skipping optional rewards', () => {
    const doc = fixture([
      { id: 'required', kind: 'collectible', x: 4, y: 13, required: true },
      { id: 'optional', kind: 'collectible', x: 4, y: 4 },
    ]);
    let s = run(startPlatform(doc), 350, { move: 1 });
    expect(s.state.ending).toBe('到家啦');
    expect(s.state.collected).toEqual(['required']);
    expect(run(s, 10, { move: -1 }).state.x).toBe(s.state.x);
    const missing = structuredClone(doc);
    missing.rooms[0].objects.find((o) => o.id === 'required')!.y = 4;
    s = run(startPlatform(missing), 350, { move: 1 });
    expect(s.state.ending).toBeNull();
  });
  it('toggles nearby switches, expires timed switches, and evaluates linked doors', () => {
    const doc = fixture([
      { id: 'switch', kind: 'switch', x: 3, y: 13, seconds: 2 },
      {
        id: 'door',
        kind: 'door',
        x: 5,
        y: 12,
        height: 2,
        condition: { mode: 'all', sources: ['switch'] },
      },
    ]);
    let s = run(startPlatform(doc), 20);
    s = run(s, 1, { interact: true });
    expect(platformCondition(s, doc.rooms[0].objects.at(-1)!.condition)).toBe(true);
    s = run(s, 130);
    expect(platformCondition(s, doc.rooms[0].objects.at(-1)!.condition)).toBe(false);
    s = run(s, 70, { move: 1 });
    expect(s.state.x + PLAYER.width).toBeCloseTo(5, 3);
  });
  it('bounces on a spring, opens and closes a sign, and pauses reading', () => {
    const doc = fixture([
      { id: 'spring', kind: 'spring', x: 3, y: 13 },
      { id: 'sign', kind: 'sign', x: 2, y: 13, text: '欢迎' },
    ]);
    let s = run(startPlatform(doc), 20);
    s = run(s, 1, { interact: true });
    expect(s.state.reading?.text).toBe('欢迎');
    const x = s.state.x;
    s = run(s, 60, { move: 1 });
    expect(s.state.x).toBe(x);
    s = platformAction(s, 'close');
    s = run(s, 12, { move: 1, jump: true });
    s = run(s, 8);
    for (let i = 0; i < 150 && s.state.vy > -15; i++) s = run(s, 1);
    expect(s.state.vy).toBeLessThan(0);
    let highest = s.state.y;
    for (let i = 0; i < 65; i++) {
      s = run(s, 1);
      highest = Math.min(highest, s.state.y);
    }
    expect(highest).toBeLessThan(9); // Automatic spring momentum survives releasing jump.
    expect(startPlatform(doc, { assist: true }).assist).toBe(true);
    expect(startPlatform(doc, { from: { roomId: 'r', x: 10, y: 13 } }).preview).toBe(true);
  });
});
