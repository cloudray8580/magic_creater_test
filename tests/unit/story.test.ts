import { describe, expect, it } from 'vitest';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import type { AdventureDocument, WorldObject } from '../../src/shared/adventure/document.js';
import {
  startStory,
  storyAction,
  conditionMet,
  storyDialogue,
  type StorySession,
} from '../../src/shared/adventure/story.js';

function fixture(objects: WorldObject[] = []): AdventureDocument {
  const doc = adventureTemplate('forest-letter');
  doc.rooms = [
    {
      id: 'r',
      name: '测试房间',
      width: 8,
      height: 8,
      ground: 'grass',
      tiles: [],
      objects: [{ id: 'goal', kind: 'goal', x: 7, y: 7, ending: '完成了' }, ...objects],
    },
  ];
  doc.flags = ['helped'];
  doc.start = { roomId: 'r', x: 1, y: 1 };
  return doc;
}
function move(s: StorySession, dx: number, dy: number, n = 1) {
  for (let i = 0; i < n; i++) s = storyAction(s, { type: 'move', dx, dy });
  return s;
}

describe('C22 story exploration', () => {
  it('blocks solid terrain, borders, NPCs and invalid moves without mutating the document', () => {
    const doc = fixture([
      { id: 'cat', kind: 'npc', x: 2, y: 1, dialogue: [{ id: 'hi', text: '你好', choices: [] }] },
    ]);
    doc.rooms[0].tiles.push({ x: 1, y: 2, kind: 'solid' });
    const before = JSON.stringify(doc),
      s = startStory(doc);
    expect(move(s, 1, 0).state.x).toBe(1);
    expect(move(s, 0, 1).state.y).toBe(1);
    expect(move(s, 1, 1).state.x).toBe(1);
    expect(move(move(s, -1, 0), -1, 0).state.x).toBe(0);
    expect(JSON.stringify(doc)).toBe(before);
  });
  it('pushes one crate onto a plate, opens a linked door and undo restores every changed value', () => {
    const doc = fixture([
      { id: 'box', kind: 'box', x: 2, y: 1 },
      { id: 'plate', kind: 'plate', x: 3, y: 1 },
      { id: 'door', kind: 'door', x: 4, y: 1, condition: { mode: 'all', sources: ['plate'] } },
    ]);
    let s = startStory(doc);
    expect(conditionMet(doc, s.state, doc.rooms[0].objects.at(-1)!.condition)).toBe(false);
    s = move(s, 1, 0);
    expect(s.state.boxes.box).toEqual({ x: 3, y: 1 });
    expect(conditionMet(doc, s.state, doc.rooms[0].objects.at(-1)!.condition)).toBe(true);
    const undone = storyAction(s, { type: 'undo' });
    expect(undone.state.boxes.box).toEqual({ x: 2, y: 1 });
    expect(undone.state.x).toBe(1);
    s = move(move(move(s, 0, 1), 1, 0, 2), 0, -1);
    expect(s.state.x).toBe(4);
    expect(s.state.y).toBe(1);
  });
  it('does not push a chain of boxes or push through an obstacle', () => {
    let doc = fixture([
      { id: 'a', kind: 'box', x: 2, y: 1 },
      { id: 'b', kind: 'box', x: 3, y: 1 },
    ]);
    expect(move(startStory(doc), 1, 0).state.boxes.a.x).toBe(2);
    doc = fixture([{ id: 'a', kind: 'box', x: 2, y: 1 }]);
    doc.rooms[0].tiles.push({ x: 3, y: 1, kind: 'water' });
    expect(move(startStory(doc), 1, 0).state.boxes.a.x).toBe(2);
  });
  it('collects once, tests any/all conditions, and toggles adjacent switches only', () => {
    const doc = fixture([
      { id: 'key', kind: 'key', x: 2, y: 1 },
      { id: 'switch', kind: 'switch', x: 3, y: 1 },
    ]);
    let s = startStory(doc);
    s = storyAction(s, { type: 'interact', id: 'switch' });
    expect(s.state.switches.switch).toBeUndefined();
    s = move(s, 1, 0);
    expect(s.state.inventory).toEqual(['key']);
    expect(conditionMet(doc, s.state, { mode: 'all', sources: ['key', 'switch'] })).toBe(false);
    expect(conditionMet(doc, s.state, { mode: 'any', sources: ['key', 'switch'] })).toBe(true);
    s = storyAction(s, { type: 'interact', id: 'switch' });
    expect(conditionMet(doc, s.state, { mode: 'all', sources: ['key', 'switch'] })).toBe(true);
    s = storyAction(s, { type: 'interact', id: 'switch' });
    expect(s.state.switches.switch).toBe(false);
    s = move(move(s, -1, 0), 1, 0);
    expect(s.state.inventory).toEqual(['key']);
    expect(conditionMet(doc, s.state, { mode: 'any', sources: [] })).toBe(true);
  });
  it('runs conditional dialogue, consumes a delivered item and unlocks an ending', () => {
    const doc = fixture([
      { id: 'letter', kind: 'collectible', x: 2, y: 1, required: true },
      {
        id: 'friend',
        kind: 'npc',
        x: 3,
        y: 1,
        dialogue: [
          {
            id: 'done',
            text: '谢谢',
            condition: { mode: 'all', sources: ['flag:helped'] },
            choices: [],
          },
          {
            id: 'receive',
            text: '给我信吧',
            condition: { mode: 'all', sources: ['letter'] },
            choices: [{ label: '交给你', takeItem: 'letter', setFlag: 'helped', next: 'done' }],
          },
          { id: 'wait', text: '我在等信', choices: [] },
        ],
      },
    ]);
    doc.rooms[0].objects[0].condition = { mode: 'all', sources: ['flag:helped'] };
    let s = move(startStory(doc), 1, 0);
    s = storyAction(s, { type: 'interact', id: 'friend' });
    expect(storyDialogue(s)?.text).toBe('给我信吧');
    expect(move(s, 0, 1).state.y).toBe(1);
    s = storyAction(s, { type: 'choose', index: 0 });
    expect(s.state.inventory).toEqual([]);
    expect(s.state.flags).toContain('helped');
    expect(storyDialogue(s)?.text).toBe('谢谢');
    const reverted = storyAction(s, { type: 'undo' });
    expect(reverted.state.inventory).toEqual(['letter']);
    expect(reverted.state.flags).toEqual([]);
    s = storyAction(s, { type: 'close' });
    s = move(move(s, 0, 1, 6), 1, 0, 5);
    expect(s.state.ending).toBe('完成了');
    expect(move(s, -1, 0).state.x).toBe(7);
    expect(storyAction(s, { type: 'restart' }).state.ending).toBeNull();
  });
  it('supports distinct choice endings and refuses item trades without the item', () => {
    const doc = fixture([
      { id: 'item', kind: 'key', x: 6, y: 6 },
      {
        id: 'cat',
        kind: 'npc',
        x: 2,
        y: 1,
        dialogue: [
          {
            id: 'hi',
            text: '留下来吗？',
            choices: [
              { label: '交出礼物', takeItem: 'item', ending: '礼物结局' },
              { label: '看星星', ending: '星空结局' },
            ],
          },
        ],
      },
    ]);
    let s = storyAction(startStory(doc), { type: 'interact' });
    s = storyAction(s, { type: 'choose', index: 0 });
    expect(s.state.ending).toBeNull();
    s = storyAction(s, { type: 'choose', index: 1 });
    expect(s.state.ending).toBe('星空结局');
  });
  it('prevents infinite item rewards by repeating a choice', () => {
    const doc = fixture([
      { id: 'key', kind: 'key', x: 6, y: 6 },
      {
        id: 'giver',
        kind: 'npc',
        x: 2,
        y: 1,
        dialogue: [
          { id: 'gift', text: '这把钥匙送给你', choices: [{ label: '谢谢', giveItem: 'key' }] },
        ],
      },
    ]);
    let s = storyAction(startStory(doc), { type: 'interact' });
    s = storyAction(s, { type: 'choose', index: 0 });
    s = storyAction(s, { type: 'interact' });
    s = storyAction(s, { type: 'choose', index: 0 });
    expect(s.state.inventory).toEqual(['key']);
    expect(s.state.collected).toEqual(['key']);
  });
  it('crosses rooms, prevents portal bounce and restores an entry snapshot when resetting', () => {
    const doc = fixture([
      { id: 'key', kind: 'key', x: 2, y: 1 },
      { id: 'out', kind: 'portal', x: 3, y: 1, target: { roomId: 'b', x: 1, y: 1 } },
    ]);
    doc.rooms.push({
      id: 'b',
      name: '第二间',
      width: 8,
      height: 8,
      ground: 'wood',
      tiles: [],
      objects: [
        { id: 'back', kind: 'portal', x: 1, y: 1, target: { roomId: 'r', x: 2, y: 1 } },
        { id: 'present', kind: 'collectible', x: 2, y: 1 },
      ],
    });
    let s = move(startStory(doc), 1, 0, 2);
    expect(s.state.roomId).toBe('b');
    expect(s.state.inventory).toEqual(['key']);
    s = move(s, 1, 0);
    expect(s.state.inventory).toEqual(['key', 'present']);
    s = storyAction(s, { type: 'reset-room' });
    expect(s.state.roomId).toBe('b');
    expect(s.state.x).toBe(1);
    expect(s.state.inventory).toEqual(['key']);
    const undone = storyAction(s, { type: 'undo' });
    expect(undone.state.inventory).toEqual(['key', 'present']);
    s = move(move(s, 1, 0), -1, 0);
    expect(s.state.roomId).toBe('r');
  });
  it('completes the authored forest sample with ordinary movement and dialogue actions', () => {
    const doc = adventureTemplate('forest-letter');
    const before = JSON.stringify(doc);
    let s = startStory(doc);
    s = move(move(move(s, 0, 1), 1, 0), 0, -1);
    s = move(s, 1, 0, 2); // crate onto plate
    s = move(move(move(s, 0, 1), 1, 0, 2), 0, -1);
    s = move(s, 1, 0, 6);
    expect(s.state.roomId).toBe('forest');
    s = move(move(s, 1, 0, 6), 0, -1);
    s = storyAction(s, { type: 'interact', id: 'friend' });
    expect(storyDialogue(s)?.choices[0].label).toBe('把信交给狐狸');
    s = storyAction(storyAction(s, { type: 'choose', index: 0 }), { type: 'close' });
    s = move(move(s, 0, 1), 1, 0, 4);
    expect(s.state.ending).toContain('温暖');
    expect(JSON.stringify(doc)).toBe(before);
  });
});
