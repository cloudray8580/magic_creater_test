import { describe, expect, it } from 'vitest';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { validateAdventure } from '../../src/shared/adventure/document.js';
import {
  addStoryRoom,
  updateStoryRoom,
  removeStoryRoom,
  addStoryFlag,
  renameStoryFlag,
  removeStoryFlag,
  storyFlagReferences,
  addDialoguePage,
  updateDialoguePage,
  moveDialoguePage,
  removeDialoguePage,
  setDialogueChoice,
} from '../../src/shared/adventure/story-editor.js';
const sample = () => adventureTemplate('forest-letter');
const npc = (doc: ReturnType<typeof sample>) =>
  doc.rooms.flatMap((r) => r.objects).find((o) => o.id === 'friend')!;
describe('C41 story rooms', () => {
  it('adds independent rooms and edits names/ground within the total room limit', () => {
    const source = sample();
    const result = addStoryRoom(source);
    let doc = result.document;
    expect(source.rooms).toHaveLength(2);
    expect(doc.rooms).toHaveLength(3);
    expect(doc.rooms.at(-1)).toMatchObject({
      id: result.roomId,
      width: 16,
      height: 12,
      objects: [],
    });
    doc = updateStoryRoom(doc, result.roomId, { name: '天文小屋', ground: 'wood' });
    expect(doc.rooms.at(-1)!.name).toBe('天文小屋');
    expect(() => updateStoryRoom(doc, result.roomId, { name: '' })).toThrow();
    while (doc.rooms.length < 6) doc = addStoryRoom(doc).document;
    expect(() => addStoryRoom(doc)).toThrow(/房间/);
    expect(() => addStoryRoom(adventureTemplate())).toThrow(/探索/);
  });
  it('protects referenced rooms and clears incoming portals only after explicit confirmation', () => {
    const doc = sample();
    expect(() => removeStoryRoom(doc, 'forest')).toThrow(/引用|确认/);
    const removed = removeStoryRoom(doc, 'forest', true);
    expect(removed.rooms).toHaveLength(1);
    expect(removed.rooms[0].objects.find((o) => o.id === 'forest-door')!.target).toBeUndefined();
    expect(() => validateAdventure(removed, true)).toThrow(/传送|终点/);
    expect(() => removeStoryRoom(removed, 'garden', true)).toThrow(/一个房间/);
    expect(doc.rooms).toHaveLength(2);
  });
  it('clears a removed room start and its inventory references without deleting other characters', () => {
    const source = sample();
    const removed = removeStoryRoom(source, 'garden', true);
    expect(removed.start).toBeNull();
    expect(npc(removed)).toBeTruthy();
    expect(
      npc(removed)
        .dialogue!.flatMap((p) => p.choices)
        .some((c) => c.takeItem === 'gift'),
    ).toBe(false);
    expect(npc(removed).dialogue!.some((p) => p.condition?.sources.includes('gift'))).toBe(false);
    expect(() => validateAdventure(removed)).not.toThrow();
    expect(source.start).not.toBeNull();
  });
});
describe('C43 named story events', () => {
  it('renames every condition and choice reference atomically', () => {
    const source = sample();
    const doc = renameStoryFlag(source, 'delivered', '已送信');
    expect(doc.flags).toEqual(['已送信']);
    expect(JSON.stringify(doc)).not.toContain('delivered');
    expect(
      npc(doc)
        .dialogue!.flatMap((p) => p.choices)
        .some((c) => c.setFlag === '已送信'),
    ).toBe(true);
    expect(source.flags).toEqual(['delivered']);
    expect(storyFlagReferences(doc, '已送信')).toContain('friend');
    expect(() => renameStoryFlag(doc, '已送信', '不合法 空格')).toThrow();
  });
  it('guards event deletion and clears all dependent actions only after confirmation', () => {
    const source = addStoryFlag(sample(), '发现星星');
    expect(source.flags).toHaveLength(2);
    expect(() => addStoryFlag(source, '发现星星')).toThrow();
    expect(() => renameStoryFlag(source, 'delivered', '发现星星')).toThrow();
    expect(() => removeStoryFlag(source, 'delivered')).toThrow(/引用|确认/);
    const doc = removeStoryFlag(source, 'delivered', true);
    expect(JSON.stringify(doc)).not.toContain('delivered');
    expect(doc.flags).toEqual(['发现星星']);
    expect(storyFlagReferences(doc, '发现星星')).toEqual([]);
    expect(removeStoryFlag(doc, '发现星星').flags).toEqual([]);
  });
});
describe('C42 dialogue cards', () => {
  it('adds unique pages, supports ordering and keeps a default page', () => {
    const source = sample();
    let doc = addDialoguePage(source, 'friend');
    const page = npc(doc).dialogue!.at(-1)!;
    expect(npc(doc).dialogue!.length).toBe(npc(source).dialogue!.length + 1);
    doc = updateDialoguePage(doc, 'friend', page.id, {
      text: '星星亮起来了',
      condition: { mode: 'all', sources: ['flag:delivered'] },
    });
    doc = moveDialoguePage(doc, 'friend', page.id, -1);
    expect(npc(doc).dialogue!.at(-2)!.id).toBe(page.id);
    expect(() => updateDialoguePage(doc, 'friend', page.id, { text: '' })).toThrow();
    while (npc(doc).dialogue!.length < 8) doc = addDialoguePage(doc, 'friend');
    expect(() => addDialoguePage(doc, 'friend')).toThrow(/对话/);
  });
  it('edits choices with inventory/event/ending actions and clears next-page references explicitly', () => {
    let doc = addDialoguePage(sample(), 'friend');
    const id = npc(doc).dialogue!.at(-1)!.id;
    const initial = npc(doc).dialogue![0].id;
    doc = setDialogueChoice(doc, 'friend', initial, 0, {
      label: '打开星图',
      next: id,
      giveItem: 'gift',
      setFlag: 'delivered',
      ending: '星空是你的礼物',
    });
    expect(npc(doc).dialogue![0].choices[0].next).toBe(id);
    expect(() => removeDialoguePage(doc, 'friend', id)).toThrow(/引用|确认/);
    doc = removeDialoguePage(doc, 'friend', id, true);
    expect(npc(doc).dialogue![0].choices[0].next).toBeUndefined();
    expect(npc(doc).dialogue![0].choices[0].ending).toBe('星空是你的礼物');
    doc = setDialogueChoice(doc, 'friend', initial, 0, null);
    expect(npc(doc).dialogue![0].choices).toEqual([]);
  });
  it('rejects deleting the only default or last page, invalid targets, and too many choices', () => {
    const source = sample();
    const fallback = npc(source).dialogue!.find((p) => !p.condition)!;
    expect(() => removeDialoguePage(source, 'friend', fallback.id, true)).toThrow(/默认/);
    expect(() =>
      setDialogueChoice(source, 'friend', fallback.id, 0, { label: '继续', next: 'missing' }),
    ).toThrow(/不存在/);
    let doc = source;
    for (let i = 0; i < 3; i++)
      doc = setDialogueChoice(doc, 'friend', fallback.id, i, { label: '选项' + i });
    expect(() => setDialogueChoice(doc, 'friend', fallback.id, 3, { label: '多余' })).toThrow();
    const home = adventureTemplate('secret-home');
    expect(() => removeDialoguePage(home, 'host', 'hello', true)).toThrow(/一页|对话/);
    expect(() => addDialoguePage(source, 'gift')).toThrow(/人物/);
  });
});
