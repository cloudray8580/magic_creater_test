import { validateCreative as validateAdventure } from '../creative.js';
import {
  ensure,
  WORLD_LIMITS,
  type AdventureDocument,
  type Room,
  type WorldObject,
  type DialoguePage,
  type Choice,
} from './document.js';
import { referencesTo, removeObjects, updateObject } from './editor.js';
function objects(doc: AdventureDocument) {
  return doc.rooms.flatMap((r) => r.objects);
}
function story(doc: AdventureDocument) {
  ensure(doc.gameType === 'story', '此编辑操作仅用于探索故事');
}
function character(doc: AdventureDocument, id: string): WorldObject {
  story(doc);
  const npc = objects(doc).find((o) => o.id === id);
  ensure(npc?.kind === 'npc', '请选择一个人物');
  return npc;
}
function pageIndex(pages: DialoguePage[], id: string) {
  const index = pages.findIndex((p) => p.id === id);
  ensure(index >= 0, '对话页不存在');
  return index;
}
export function addStoryRoom(doc: AdventureDocument): {
  document: AdventureDocument;
  roomId: string;
} {
  story(doc);
  ensure(doc.rooms.length < WORLD_LIMITS.rooms, '最多可以创建6个房间');
  const next = structuredClone(doc);
  let index = 1;
  while (next.rooms.some((r) => r.id === 'room-' + index)) index++;
  const room: Room = {
    id: 'room-' + index,
    name: '新房间 ' + index,
    width: 16,
    height: 12,
    ground: 'grass',
    tiles: [],
    objects: [],
  };
  for (let y = 0; y < room.height; y++)
    for (let x = 0; x < room.width; x++)
      if (x === 0 || y === 0 || x === room.width - 1 || y === room.height - 1)
        room.tiles.push({ x, y, kind: 'solid' });
  next.rooms.push(room);
  return { document: validateAdventure(next), roomId: room.id };
}
export function updateStoryRoom(
  doc: AdventureDocument,
  id: string,
  patch: Partial<Pick<Room, 'name' | 'ground'>>,
): AdventureDocument {
  story(doc);
  ensure(
    Object.keys(patch).every((k) => ['name', 'ground'].includes(k)),
    '房间设置字段无效',
  );
  const next = structuredClone(doc),
    room = next.rooms.find((r) => r.id === id);
  ensure(room, '房间不存在');
  Object.assign(room, patch);
  return validateAdventure(next);
}
export function removeStoryRoom(
  doc: AdventureDocument,
  id: string,
  clearReferences = false,
): AdventureDocument {
  story(doc);
  ensure(doc.rooms.length > 1, '至少保留一个房间');
  const room = doc.rooms.find((r) => r.id === id);
  ensure(room, '房间不存在');
  const owned = new Set(room.objects.map((o) => o.id));
  const incoming = objects(doc).some((o) => !owned.has(o.id) && o.target?.roomId === id);
  const linked = room.objects.some((o) => referencesTo(doc, o.id).some((ref) => !owned.has(ref)));
  ensure(
    clearReferences || (!incoming && !linked && doc.start?.roomId !== id),
    '此房间被起点、门户或任务引用，请确认删除并清理连接',
  );
  const next = removeObjects(doc, [...owned], true);
  next.rooms = next.rooms.filter((r) => r.id !== id);
  if (next.start?.roomId === id) next.start = null;
  for (const o of objects(next)) if (o.target?.roomId === id) delete o.target;
  return validateAdventure(next);
}
export function storyFlagReferences(doc: AdventureDocument, flag: string): string[] {
  const source = 'flag:' + flag;
  return objects(doc)
    .filter(
      (o) =>
        o.condition?.sources.includes(source) ||
        o.dialogue?.some(
          (p) => p.condition?.sources.includes(source) || p.choices.some((c) => c.setFlag === flag),
        ),
    )
    .map((o) => o.id);
}
export function addStoryFlag(doc: AdventureDocument, name: string): AdventureDocument {
  story(doc);
  return validateAdventure({ ...doc, flags: [...doc.flags, name] });
}
export function renameStoryFlag(
  doc: AdventureDocument,
  previous: string,
  name: string,
): AdventureDocument {
  story(doc);
  ensure(doc.flags.includes(previous), '故事标记不存在');
  const next = structuredClone(doc);
  next.flags = next.flags.map((f) => (f === previous ? name : f));
  for (const o of objects(next)) {
    if (o.condition)
      o.condition.sources = o.condition.sources.map((s) =>
        s === 'flag:' + previous ? 'flag:' + name : s,
      );
    for (const p of o.dialogue ?? []) {
      if (p.condition)
        p.condition.sources = p.condition.sources.map((s) =>
          s === 'flag:' + previous ? 'flag:' + name : s,
        );
      for (const c of p.choices) if (c.setFlag === previous) c.setFlag = name;
    }
  }
  return validateAdventure(next);
}
export function removeStoryFlag(
  doc: AdventureDocument,
  name: string,
  clearReferences = false,
): AdventureDocument {
  story(doc);
  ensure(doc.flags.includes(name), '故事标记不存在');
  ensure(
    clearReferences || !storyFlagReferences(doc, name).length,
    '这件事被机关或对话引用，请确认删除并清理连接',
  );
  const next = structuredClone(doc);
  next.flags = next.flags.filter((f) => f !== name);
  for (const o of objects(next)) {
    if (o.condition) o.condition.sources = o.condition.sources.filter((s) => s !== 'flag:' + name);
    for (const p of o.dialogue ?? []) {
      if (p.condition)
        p.condition.sources = p.condition.sources.filter((s) => s !== 'flag:' + name);
      for (const c of p.choices) if (c.setFlag === name) delete c.setFlag;
    }
  }
  return validateAdventure(next);
}
export function addDialoguePage(doc: AdventureDocument, npcId: string): AdventureDocument {
  const pages = structuredClone(character(doc, npcId).dialogue ?? []);
  let n = 1;
  while (pages.some((p) => p.id === 'page-' + n)) n++;
  pages.push({ id: 'page-' + n, text: '这里会发生什么故事？', choices: [] });
  return updateObject(doc, npcId, { dialogue: pages });
}
export function updateDialoguePage(
  doc: AdventureDocument,
  npcId: string,
  id: string,
  patch: Partial<Omit<DialoguePage, 'id'>>,
): AdventureDocument {
  ensure(!('id' in patch), '对话编号不能直接更改');
  const pages = structuredClone(character(doc, npcId).dialogue ?? []);
  const index = pageIndex(pages, id);
  Object.assign(pages[index], structuredClone(patch));
  return updateObject(doc, npcId, { dialogue: pages });
}
export function moveDialoguePage(
  doc: AdventureDocument,
  npcId: string,
  id: string,
  direction: -1 | 1,
): AdventureDocument {
  const pages = structuredClone(character(doc, npcId).dialogue ?? []),
    index = pageIndex(pages, id);
  ensure(direction === -1 || direction === 1, '对话顺序无效');
  const target = index + direction;
  ensure(target >= 0 && target < pages.length, '已经到达对话边界');
  [pages[index], pages[target]] = [pages[target], pages[index]];
  return updateObject(doc, npcId, { dialogue: pages });
}
export function removeDialoguePage(
  doc: AdventureDocument,
  npcId: string,
  id: string,
  clearReferences = false,
): AdventureDocument {
  const pages = structuredClone(character(doc, npcId).dialogue ?? []);
  pageIndex(pages, id);
  ensure(pages.length > 1, '至少保留一页对话');
  const remaining = pages.filter((p) => p.id !== id);
  ensure(
    remaining.some((p) => !p.condition),
    '请先保留一页默认对话',
  );
  ensure(
    clearReferences || !remaining.some((p) => p.choices.some((c) => c.next === id)),
    '有选项引用此对话页，请确认删除并清理连接',
  );
  for (const p of remaining) for (const c of p.choices) if (c.next === id) delete c.next;
  return updateObject(doc, npcId, { dialogue: remaining });
}
export function setDialogueChoice(
  doc: AdventureDocument,
  npcId: string,
  id: string,
  index: number,
  choice: Choice | null,
): AdventureDocument {
  const pages = structuredClone(character(doc, npcId).dialogue ?? []);
  const page = pages[pageIndex(pages, id)];
  ensure(
    Number.isInteger(index) && index >= 0 && index <= page.choices.length && index < 3,
    '每页最多3个选项',
  );
  if (choice === null) {
    ensure(index < page.choices.length, '对话选项不存在');
    page.choices.splice(index, 1);
  } else page.choices[index] = structuredClone(choice);
  return updateObject(doc, npcId, { dialogue: pages });
}
