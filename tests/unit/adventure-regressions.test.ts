import { describe, expect, it } from 'vitest';
import { validateAdventure, type AdventureDocument } from '../../src/shared/adventure/document.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { startStory, storyAction } from '../../src/shared/adventure/story.js';
import {
  startPlatform,
  stepPlatform,
  PLAYER,
  type PlatformSession,
} from '../../src/shared/adventure/platform.js';
function story(): AdventureDocument {
  const d = adventureTemplate('forest-letter');
  d.flags = ['done'];
  d.rooms = [
    {
      id: 'r',
      name: '房间',
      width: 12,
      height: 12,
      ground: 'grass',
      tiles: [],
      objects: [{ id: 'g', kind: 'goal', x: 10, y: 10 }],
    },
  ];
  d.start = { roomId: 'r', x: 1, y: 1 };
  return d;
}
function platform(): AdventureDocument {
  const d = adventureTemplate('cloud-post');
  d.rooms = [
    {
      id: 'r',
      name: '跑道',
      width: 30,
      height: 16,
      ground: 'grass',
      tiles: Array.from({ length: 30 }, (_, x) => ({ x, y: 14, kind: 'solid' as const })),
      objects: [{ id: 'g', kind: 'goal', x: 28, y: 13 }],
    },
  ];
  d.start = { roomId: 'r', x: 3, y: 9 };
  return d;
}
function step(s: PlatformSession, move = 0, jump = false, interact = false) {
  return stepPlatform(s, { move, jump, interact }, 1 / 60);
}

describe('M2 independent review regressions', () => {
  it('rejects prototype-sensitive entity ids at the document boundary', () => {
    for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const d = story();
      d.rooms[0].objects.push({ id, kind: 'switch', x: 2, y: 1 });
      expect(() => validateAdventure(d)).toThrow(/编号/);
    }
  });
  it('retains original room entry on same-room teleport and undo restores teleport state', () => {
    const d = story();
    d.rooms[0].objects.push(
      { id: 'item', kind: 'key', x: 2, y: 1 },
      { id: 'p', kind: 'portal', x: 3, y: 1, target: { roomId: 'r', x: 5, y: 1 } },
    );
    let s = startStory(d);
    s = storyAction(storyAction(s, { type: 'move', dx: 1, dy: 0 }), { type: 'move', dx: 1, dy: 0 });
    expect(s.state.x).toBe(5);
    s = storyAction(s, { type: 'reset-room' });
    expect(s.state.x).toBe(1);
    expect(s.state.inventory).toEqual([]);
    s = storyAction(s, { type: 'undo' });
    expect(s.state.x).toBe(5);
    expect(s.state.inventory).toEqual(['item']);
  });
  it('requires a configured NPC for play but accepts an unfinished draft', () => {
    const d = story();
    d.rooms[0].objects.push({ id: 'cat', kind: 'npc', x: 3, y: 1 });
    expect(validateAdventure(d)).toEqual(d);
    expect(() => validateAdventure(d, true)).toThrow(/对话/);
  });
  it('allows an always-open doorway as a portal destination', () => {
    const d = story();
    d.rooms[0].objects.push(
      { id: 'door', kind: 'door', x: 5, y: 1, condition: { mode: 'all', sources: [] } },
      { id: 'p', kind: 'portal', x: 2, y: 1, target: { roomId: 'r', x: 5, y: 1 } },
    );
    expect(() => validateAdventure(d, true)).not.toThrow();
  });
  it('does not reissue a delivered unique item through a second reward option', () => {
    const d = story();
    d.rooms[0].objects.push(
      { id: 'item', kind: 'key', x: 2, y: 1 },
      {
        id: 'npc',
        kind: 'npc',
        x: 3,
        y: 1,
        dialogue: [
          {
            id: 'page',
            text: '物品交换',
            choices: [
              { label: '交出', takeItem: 'item', setFlag: 'done' },
              { label: '领取', giveItem: 'item' },
            ],
          },
        ],
      },
    );
    let s = storyAction(startStory(d), { type: 'move', dx: 1, dy: 0 });
    s = storyAction(storyAction(s, { type: 'interact' }), { type: 'choose', index: 0 });
    s = storyAction(storyAction(s, { type: 'interact' }), { type: 'choose', index: 1 });
    expect(s.state.inventory).toEqual([]);
    expect(s.state.collected).toEqual(['item']);
  });
  it('catches the top of a fast ascending platform on its first simulation frame', () => {
    const d = platform();
    d.rooms[0].objects.push({
      id: 'lift',
      kind: 'mover',
      x: 2,
      y: 10,
      width: 3,
      route: { x: 2, y: 6 },
      speed: 'fast',
    });
    const s = step(startPlatform(d));
    expect(s.state.groundId).toBe('lift');
    expect(s.state.y + PLAYER.height).toBeCloseTo(9.95, 5);
  });
  it('recovers from vertical platform crushing instead of passing through the ceiling', () => {
    const d = platform();
    d.start = { roomId: 'r', x: 3, y: 9 };
    for (let x = 1; x <= 6; x++) d.rooms[0].tiles.push({ x, y: 6, kind: 'solid' });
    d.rooms[0].objects.push({
      id: 'lift',
      kind: 'mover',
      x: 2,
      y: 10,
      width: 3,
      route: { x: 2, y: 6 },
      speed: 'slow',
    });
    let s = startPlatform(d),
      crossed = false;
    for (let i = 0; i < 300 && s.state.deaths === 0; i++) {
      s = step(s);
      if (s.state.y < 7 - 1e-6) crossed = true;
    }
    expect(crossed).toBe(false);
    expect(s.state.deaths).toBe(1);
  });
  it('does not bounce on the side of a spring but launches from its top', () => {
    const d = platform();
    d.start = { roomId: 'r', x: 2, y: 13 };
    d.rooms[0].objects.push({ id: 'spring', kind: 'spring', x: 3, y: 13 });
    let s = startPlatform(d),
      bounced = false;
    for (let i = 0; i < 40; i++) {
      s = step(s, 1);
      if (s.state.vy < 0) bounced = true;
    }
    expect(bounced).toBe(false);
    d.start = { roomId: 'r', x: 3, y: 11 };
    s = startPlatform(d);
    for (let i = 0; i < 50 && s.state.vy >= 0; i++) s = step(s);
    expect(s.state.vy).toBeLessThan(-15);
  });
  it('rejects a checkpoint inside static danger or terrain', () => {
    for (const solid of [false, true]) {
      const d = platform();
      d.rooms[0].objects.push({ id: 'cp', kind: 'checkpoint', x: 6, y: 13 });
      if (solid) d.rooms[0].tiles.push({ x: 6, y: 13, kind: 'solid' });
      else d.rooms[0].objects.push({ id: 'hazard', kind: 'hazard', x: 6, y: 13 });
      expect(() => validateAdventure(d, true)).toThrow(/检查点/);
    }
  });
  it('keeps a timed door open until the occupying player leaves, without teleporting across it', () => {
    const d = platform();
    d.start = { roomId: 'r', x: 2, y: 13 };
    d.rooms[0].objects.push(
      { id: 's', kind: 'switch', x: 3, y: 13, seconds: 2 },
      { id: 'd', kind: 'door', x: 5, y: 12, height: 2, condition: { mode: 'all', sources: ['s'] } },
    );
    let s = startPlatform(d);
    for (let i = 0; i < 20; i++) s = step(s);
    s = step(s, 0, false, true);
    for (let i = 0; i < 80 && s.state.x < 4.65; i++) s = step(s, 1);
    for (let i = 0; i < 130; i++) s = step(s);
    expect(s.state.x).toBeGreaterThan(4.8);
    expect(s.state.x).toBeLessThan(5.6);
    const before = s.state.x;
    s = step(s, -1);
    expect(s.state.x).toBeLessThan(before);
    expect(before - s.state.x).toBeLessThan(0.1);
  });
  it('catches an ascending player when a lift ascends faster underneath', () => {
    const d = platform();
    d.start = { roomId: 'r', x: 3, y: 13 };
    d.rooms[0].objects.push({
      id: 'lift',
      kind: 'mover',
      x: 2,
      y: 13,
      width: 3,
      route: { x: 2, y: 6 },
      speed: 'fast',
    });
    let s = startPlatform(d);
    for (let i = 0; i < 16; i++) s = step(s);
    for (let i = 0; i < 26; i++) s = step(s, 0, true);
    expect(s.state.groundId).toBe('lift');
    expect(s.state.onGround).toBe(true);
  });
  it('saves the safe trigger position instead of relocating into a patrol', () => {
    const d = platform();
    d.start = { roomId: 'r', x: 1, y: 13 };
    d.rooms[0].objects.push(
      { id: 'cp', kind: 'checkpoint', x: 6, y: 13 },
      { id: 'p', kind: 'patrol', x: 7, y: 13, route: { x: 4, y: 13 }, speed: 'slow' },
    );
    let s = startPlatform(d);
    for (let i = 0; i < 180 && s.state.deaths === 0; i++) s = step(s, 1);
    expect(s.state.deaths).toBe(1);
    expect(s.state.checkpointId).toBe('cp');
    for (let i = 0; i < 5; i++) s = step(s, -1);
    expect(s.state.deaths).toBe(1);
    expect(s.state.x).toBeLessThan(s.checkpoint.x);
  });
});
