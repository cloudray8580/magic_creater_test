import { describe, expect, it } from 'vitest';
import {
  framePlatform,
  frameStory,
  keyboardDirection,
  tileTexture,
  ReadableNotice,
} from '../../src/client/adventure/view.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { startPlatform } from '../../src/shared/adventure/platform.js';
import { startStory, storyAction } from '../../src/shared/adventure/story.js';
describe('game presentation from authoritative runtime state', () => {
  it('maps keyboard directions consistently and cancels opposite keys', () => {
    expect(keyboardDirection(new Set(['KeyA', 'KeyD']))).toEqual({ x: 0, y: 0 });
    expect(keyboardDirection(new Set(['ArrowLeft', 'KeyW']))).toEqual({ x: -1, y: -1 });
    expect(keyboardDirection(new Set(['KeyS']))).toEqual({ x: 0, y: 1 });
  });
  it('shows platform switch, checkpoint and door state and hides collected objects', () => {
    const s = startPlatform(adventureTemplate('cloud-post'));
    const r = s.document.rooms[0],
      collectible = r.objects.find((o) => o.kind === 'collectible')!;
    const door = r.objects.find((o) => o.kind === 'door')!,
      cp = r.objects.find((o) => o.kind === 'checkpoint')!;
    s.state.collected.push(collectible.id);
    s.state.heldDoors.push(door.id);
    s.state.checkpointId = cp.id;
    const frame = framePlatform(s);
    expect(frame.objects.find((o) => o.id === collectible.id)?.visible).toBe(false);
    expect(frame.objects.find((o) => o.id === door.id)?.texture).toBe('door-open');
    expect(frame.objects.find((o) => o.id === cp.id)?.texture).toBe('checkpoint-on');
    expect(frame.collected).toBe(1);
    expect(frame.hero.x).toBeCloseTo(s.state.x + 0.31);
    expect(frame.dialogue).toBeNull();
    expect(frame.mode).toBe('platformer');
  });
  it('reflects pushed boxes, dialogue, inventory, room changes and undo in story frames', () => {
    const d = adventureTemplate('forest-letter');
    const s = startStory(d);
    const box = d.rooms[0].objects.find((o) => o.kind === 'box')!;
    s.state.boxes[box.id] = { x: 8, y: 8 };
    let frame = frameStory(s);
    expect(frame.objects.find((o) => o.id === box.id)?.x).toBe(8.5);
    const npc = d.rooms[1].objects.find((o) => o.kind === 'npc')!;
    s.state.roomId = d.rooms[1].id;
    s.state.x = npc.x - 1;
    s.state.y = npc.y;
    frame = frameStory(storyAction(s, { type: 'interact', id: npc.id }));
    expect(frame.dialogue?.text).toBeTruthy();
    expect(frame.prompt).toContain('E');
    expect(frame.room.id).toBe(d.rooms[1].id);
    expect(frame.mode).toBe('story');
  });
});

it('uses an available default picture for a decoration without a chosen skin', () => {
  for (const template of ['cloud-post', 'forest-letter'] as const) {
    const doc = adventureTemplate(template);
    const decoration = doc.rooms[0].objects.find((o) => o.kind === 'decoration')!;
    delete decoration.skin;
    const frame =
      doc.gameType === 'story' ? frameStory(startStory(doc)) : framePlatform(startPlatform(doc));
    expect(frame.objects.find((o) => o.id === decoration.id)!.texture).toBe('tree');
  }
});

it('chooses the same exposed grass, earth and stone tiles for editor and runtime', () => {
  const d = adventureTemplate();
  const r = d.rooms[0];
  expect(tileTexture('platformer', r, { x: 0, y: 14, kind: 'solid' })).toBe('grass-edge');
  expect(tileTexture('platformer', r, { x: 0, y: 15, kind: 'solid' })).toBe('earth');
  expect(tileTexture('story', r, { x: 0, y: 14, kind: 'solid' })).toBe('stone');
  expect(tileTexture('platformer', { ...r, ground: 'wood' }, { x: 0, y: 14, kind: 'solid' })).toBe(
    'stone',
  );
  expect(tileTexture('story', r, { x: 0, y: 3, kind: 'water' })).toBe('water');
});

it('uses the selected patrol art, visible bridge and matching centered interaction target', () => {
  const d = adventureTemplate('moving-bridge');
  const r = d.rooms[0];
  r.objects.push({ id: 'guard', kind: 'patrol', x: 4, y: 4, skin: 'cat', route: { x: 6, y: 4 } });
  r.objects.push({ id: 'talk', kind: 'sign', x: 2, y: 2, name: '中心路牌' });
  const s = startPlatform(d);
  s.state.x = 0.4;
  s.state.y = 2;
  const f = framePlatform(s);
  expect(f.objects.find((o) => o.id === 'guard')?.texture).toBe('cat');
  expect(f.objects.find((o) => o.texture === 'mover')?.height).toBe(1);
  expect(f.prompt).toContain('中心路牌');
});
it('separates required goals, optional finds and timed switch state', () => {
  const s = startPlatform(adventureTemplate());
  s.document.rooms[0].objects.push({ id: 'clock', kind: 'switch', x: 4, y: 4, seconds: 3 });
  s.state.switches.clock = 3;
  s.state.elapsed = 1.2;
  const f = framePlatform(s);
  expect(f.requiredTotal).toBe(
    s.document.rooms[0].objects.filter((o) => o.kind === 'collectible' && o.required).length,
  );
  expect(f.timer).toContain('2 秒');
});

it('keeps short notices readable for two seconds without blocking input', () => {
  const notice = new ReadableNotice();
  expect(notice.update('找到来信', 100)).toBe('找到来信');
  expect(notice.update('', 250)).toBe('找到来信');
  expect(notice.update('', 2099)).toBe('找到来信');
  expect(notice.update('', 2100)).toBe('');
  expect(notice.update('新提示', 2200)).toBe('新提示');
  notice.clear();
  expect(notice.update('', 2201)).toBe('');
});

it('shows repeated identical pickup notices as distinct events', () => {
  const n = new ReadableNotice();
  expect(n.update('找到礼物', 0, 'pickup-1')).toBe('找到礼物');
  expect(n.update('找到礼物', 2500, 'pickup-1')).toBe('');
  expect(n.update('找到礼物', 2600, 'pickup-2')).toBe('找到礼物');
});
it('explains the missing named requirement at a story goal', () => {
  const d = adventureTemplate('forest-letter');
  const room = d.rooms[1],
    goal = room.objects.find((o) => o.kind === 'goal')!;
  d.start = { roomId: room.id, x: goal.x, y: goal.y };
  expect(startStory(d).state.notice).toContain(goal.condition!.sources[0].slice(5));
});
