import type { Room, WorldObject } from '../../shared/adventure/document.js';
import {
  platformDoorOpen,
  platformInteractions,
  platformCondition,
  movingPosition,
  PLAYER,
  type PlatformSession,
} from '../../shared/adventure/platform.js';
import {
  conditionMet,
  platePressed,
  nearbyInteractions,
  storyDialogue,
  type StorySession,
} from '../../shared/adventure/story.js';
export interface VisualObject {
  id: string;
  texture: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  depth: number;
}
export interface GameFrame {
  mode: 'platformer' | 'story';
  room: Room;
  objects: VisualObject[];
  hero: { x: number; y: number; facing: number; moving: boolean; airborne: boolean };
  collected: number;
  total: number;
  requiredCollected: number;
  requiredTotal: number;
  timer: string;
  inventory: string[];
  deaths: number;
  steps: number;
  ending: string | null;
  dialogue: { title: string; text: string; choices: { label: string }[] } | null;
  notice: string;
  noticeKey: string;
  prompt: string;
}
export function keyboardDirection(keys: Set<string>) {
  const has = (a: string, b: string) => Number(keys.has(a) || keys.has(b));
  return {
    x: has('KeyD', 'ArrowRight') - has('KeyA', 'ArrowLeft'),
    y: has('KeyS', 'ArrowDown') - has('KeyW', 'ArrowUp'),
  };
}
function visual(o: WorldObject, texture = o.skin ?? o.kind): VisualObject {
  const width = o.width ?? 1,
    height = o.height ?? 1;
  return {
    id: o.id,
    texture: texture === 'decoration' ? 'tree' : texture,
    x: o.x + width / 2,
    y: o.y + height,
    width,
    height,
    visible: true,
    depth: o.kind === 'decoration' ? 1 : 3,
  };
}
export function framePlatform(s: PlatformSession): GameFrame {
  const p = s.state,
    room = s.document.rooms[0];
  return {
    mode: 'platformer',
    room,
    objects: room.objects.map((o) => {
      const v = visual(o, o.skin ?? (o.kind === 'patrol' ? 'bird' : o.kind));
      if (o.kind === 'mover' || o.kind === 'patrol') {
        const pos = movingPosition(o, p.elapsed);
        v.x = pos.x + v.width / 2;
        v.y = pos.y + (o.kind === 'mover' ? 1 - 7 / 128 : 1);
        if (o.kind === 'mover') v.height = 1;
      }
      if (o.kind === 'door') v.texture = platformDoorOpen(s, o) ? 'door-open' : 'door';
      if (o.kind === 'switch')
        v.texture = platformCondition(s, { mode: 'all', sources: [o.id] }) ? 'switch-on' : 'switch';
      if (o.kind === 'checkpoint')
        v.texture = p.checkpointId === o.id ? 'checkpoint-on' : 'checkpoint';
      if (o.kind === 'collectible' || o.kind === 'key') v.visible = !p.collected.includes(o.id);
      return v;
    }),
    hero: {
      x: p.x + PLAYER.width / 2,
      y: p.y + PLAYER.height,
      facing: p.facing,
      moving: Math.abs(p.vx) > 0.1,
      airborne: !p.onGround,
    },
    collected: p.collected.length,
    total: room.objects.filter((o) => ['key', 'collectible'].includes(o.kind)).length,
    requiredCollected: room.objects.filter(
      (o) => o.kind === 'collectible' && o.required && p.collected.includes(o.id),
    ).length,
    requiredTotal: room.objects.filter((o) => o.kind === 'collectible' && o.required).length,
    timer: room.objects
      .filter((o) => o.kind === 'switch' && p.switches[o.id] > p.elapsed)
      .map((o) => (o.name || '计时开关') + '：' + Math.ceil(p.switches[o.id] - p.elapsed) + ' 秒')
      .join(' · '),
    inventory: [],
    deaths: p.deaths,
    steps: 0,
    ending: p.ending,
    dialogue: p.reading ? { ...p.reading, choices: [] } : null,
    notice: p.notice,
    noticeKey: p.notice + ':' + p.collected.length + ':' + JSON.stringify(p.switches),
    prompt: platformInteractions(s).length
      ? 'E · ' + (platformInteractions(s)[0].name || '互动')
      : '',
  };
}
export function frameStory(s: StorySession): GameFrame {
  const p = s.state,
    room = s.document.rooms.find((r) => r.id === p.roomId)!;
  return {
    mode: 'story',
    room,
    objects: room.objects.map((o) => {
      const v = visual(o, o.skin ?? (o.kind === 'npc' ? 'cat' : o.kind));
      if (o.kind === 'box') {
        v.x = s.state.boxes[o.id].x + 0.5;
        v.y = s.state.boxes[o.id].y + 1;
      }
      if (o.kind === 'door')
        v.texture = conditionMet(s.document, p, o.condition) ? 'door-open' : 'door';
      if (o.kind === 'plate') v.texture = platePressed(s.document, p, o) ? 'plate-on' : 'plate';
      if (o.kind === 'switch') v.texture = p.switches[o.id] ? 'switch-on' : 'switch';
      if (o.kind === 'collectible' || o.kind === 'key') v.visible = !p.collected.includes(o.id);
      v.depth = o.kind === 'plate' ? 2 : v.y + 3;
      return v;
    }),
    hero: { x: p.x + 0.5, y: p.y + 1, facing: p.facing.x || 1, moving: false, airborne: false },
    collected: p.collected.length,
    total: s.document.rooms
      .flatMap((r) => r.objects)
      .filter((o) => ['key', 'collectible'].includes(o.kind)).length,
    requiredCollected: s.document.rooms
      .flatMap((r) => r.objects)
      .filter((o) => o.kind === 'collectible' && o.required && p.collected.includes(o.id)).length,
    requiredTotal: s.document.rooms
      .flatMap((r) => r.objects)
      .filter((o) => o.kind === 'collectible' && o.required).length,
    timer: '',
    inventory: p.inventory.map(
      (id) => s.document.rooms.flatMap((r) => r.objects).find((o) => o.id === id)?.name || '物品',
    ),
    deaths: 0,
    steps: p.steps,
    ending: p.ending,
    dialogue: storyDialogue(s),
    notice: p.notice,
    noticeKey: p.notice + ':' + p.collected.length + ':' + JSON.stringify(p.switches),
    prompt: nearbyInteractions(s).length ? 'E · ' + (nearbyInteractions(s)[0].name || '互动') : '',
  };
}

/** Shared art choice: the editor must show the surface the player will see. */
export function tileTexture(
  mode: 'platformer' | 'story',
  room: Room,
  tile: Room['tiles'][number],
): string {
  if (tile.kind !== 'solid') return tile.kind;
  if (mode !== 'platformer' || room.ground !== 'grass') return 'stone';
  return room.tiles.some((t) => t.x === tile.x && t.y === tile.y - 1 && t.kind === 'solid')
    ? 'earth'
    : 'grass-edge';
}

/** Keep brief feedback readable while permitting immediate movement. */
export class ReadableNotice {
  private last = '';
  private text = '';
  private until = 0;
  update(value: string, now: number, eventKey = value): string {
    if (value && eventKey !== this.last) {
      this.text = value;
      this.until = now + 2000;
    }
    this.last = value ? eventKey : '';
    return now < this.until ? this.text : '';
  }
  clear() {
    this.last = '';
    this.text = '';
    this.until = 0;
  }
}
