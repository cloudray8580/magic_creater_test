import { describe, expect, it } from 'vitest';
import { framePlatform, frameStory, keyboardDirection } from '../../src/client/adventure/view.js';
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
