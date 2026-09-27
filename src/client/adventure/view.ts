import type { Room, WorldObject } from '../../shared/adventure/document.js';
import {
  platformDoorOpen,
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
  inventory: string[];
  deaths: number;
  steps: number;
  ending: string | null;
  dialogue: { title: string; text: string; choices: { label: string }[] } | null;
  notice: string;
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
      const v = visual(o, o.kind === 'patrol' ? 'bird' : (o.skin ?? o.kind));
      if (o.kind === 'mover' || o.kind === 'patrol') {
        const pos = movingPosition(o, p.elapsed);
        v.x = pos.x + v.width / 2;
        v.y = pos.y + (o.kind === 'mover' ? 0.25 : 1);
        if (o.kind === 'mover') v.height = 0.3;
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
    inventory: [],
    deaths: p.deaths,
    steps: 0,
    ending: p.ending,
    dialogue: p.reading ? { ...p.reading, choices: [] } : null,
    notice: p.notice,
    prompt: room.objects.some(
      (o) => ['switch', 'sign'].includes(o.kind) && Math.hypot(o.x - p.x, o.y - p.y) < 1.8,
    )
      ? 'E · 互动'
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
    inventory: p.inventory.map(
      (id) => s.document.rooms.flatMap((r) => r.objects).find((o) => o.id === id)?.name || '物品',
    ),
    deaths: 0,
    steps: p.steps,
    ending: p.ending,
    dialogue: storyDialogue(s),
    notice: p.notice,
    prompt: nearbyInteractions(s).length ? 'E · ' + (nearbyInteractions(s)[0].name || '互动') : '',
  };
}
