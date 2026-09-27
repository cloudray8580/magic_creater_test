import {
  BUILTIN_SKINS,
  ensure,
  validateAdventure,
  type AdventureDocument,
  type Room,
  type WorldObject,
  type ObjectKind,
  type TileKind,
} from './document.js';
export type EditLayer = 'terrain' | 'objects' | 'decoration';
export type PaintTool = TileKind | ObjectKind | (typeof BUILTIN_SKINS)[number] | 'spawn' | 'erase';
export interface Cell {
  x: number;
  y: number;
}
const TERRAIN = ['solid', 'oneway', 'water'];
export function objectLayer(o: WorldObject): EditLayer {
  return o.kind === 'decoration' ? 'decoration' : 'objects';
}
function allObjects(doc: AdventureDocument) {
  return doc.rooms.flatMap((r) => r.objects);
}
function findObject(doc: AdventureDocument, id: string) {
  const room = doc.rooms.find((r) => r.objects.some((o) => o.id === id));
  ensure(room, '物体不存在');
  return { room, object: room.objects.find((o) => o.id === id)! };
}
function freshId(doc: AdventureDocument, base: string): string {
  const ids = new Set(allObjects(doc).map((o) => o.id));
  let id = base,
    n = 1;
  while (ids.has(id)) id = base + '-' + n++;
  return id;
}
export function strokeCells(a: Cell, b: Cell): Cell[] {
  ensure(
    [a.x, a.y, b.x, b.y].every(Number.isSafeInteger) &&
      Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) <= 128,
    '画笔超出范围',
  );
  const cells: Cell[] = [];
  let x = a.x,
    y = a.y;
  const dx = Math.abs(b.x - x),
    dy = -Math.abs(b.y - y),
    sx = x < b.x ? 1 : -1,
    sy = y < b.y ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    cells.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e = error * 2;
    if (e >= dy) {
      error += dy;
      x += sx;
    }
    if (e <= dx) {
      error += dx;
      y += sy;
    }
  }
  return cells;
}
export function referencesTo(doc: AdventureDocument, id: string): string[] {
  return allObjects(doc)
    .filter(
      (o) =>
        o.condition?.sources.includes(id) ||
        o.dialogue?.some(
          (p) =>
            p.condition?.sources.includes(id) ||
            p.choices.some((c) => c.giveItem === id || c.takeItem === id),
        ),
    )
    .map((o) => o.id);
}
function deleteFrom(doc: AdventureDocument, id: string, clearReferences: boolean) {
  const refs = referencesTo(doc, id);
  ensure(clearReferences || !refs.length, '这个物体被其他机关引用，请选择后确认删除并清理连接');
  const { room } = findObject(doc, id);
  room.objects = room.objects.filter((o) => o.id !== id);
  if (clearReferences)
    for (const o of allObjects(doc)) {
      if (o.condition) o.condition.sources = o.condition.sources.filter((source) => source !== id);
      for (const p of o.dialogue ?? []) {
        if (p.condition)
          p.condition.sources = p.condition.sources.filter((source) => source !== id);
        for (const c of p.choices) {
          if (c.giveItem === id) delete c.giveItem;
          if (c.takeItem === id) delete c.takeItem;
        }
      }
    }
}
export function removeObjects(
  doc: AdventureDocument,
  ids: string[],
  clearReferences = false,
): AdventureDocument {
  const next = structuredClone(doc);
  for (const id of ids) deleteFrom(next, id, clearReferences);
  return validateAdventure(next);
}
export function removeObject(
  doc: AdventureDocument,
  id: string,
  clearReferences = false,
): AdventureDocument {
  return removeObjects(doc, [id], clearReferences);
}

function defaultObject(
  doc: AdventureDocument,
  room: Room,
  cell: Cell,
  tool: PaintTool,
  layer: EditLayer,
): WorldObject {
  const kind: ObjectKind = layer === 'decoration' ? 'decoration' : (tool as ObjectKind);
  const o: WorldObject = { id: freshId(doc, kind + '-' + cell.x + '-' + cell.y), kind, ...cell };
  if (layer === 'decoration') o.skin = tool;
  if (kind === 'mover' || kind === 'patrol') {
    o.route = { x: Math.min(room.width - 1, cell.x + 3), y: cell.y };
    o.speed = 'slow';
  }
  if (kind === 'door' || kind === 'goal') o.condition = { mode: 'all', sources: [] };
  if (kind === 'goal') o.ending = '谢谢你来玩我的小世界！';
  if (kind === 'sign') o.text = '在这里写下一个提示吧。';
  if (kind === 'npc') {
    o.skin = 'cat';
    o.dialogue = [{ id: 'hello', text: '你好，欢迎来到这里！', choices: [] }];
  }
  return o;
}
export function paintWorld(
  doc: AdventureDocument,
  roomId: string,
  cells: Cell[],
  tool: PaintTool,
  layer: EditLayer,
): AdventureDocument {
  const next = structuredClone(doc),
    room = next.rooms.find((r) => r.id === roomId);
  ensure(room, '房间不存在');
  ensure(cells.length <= 4096, '画笔超出范围');
  if (tool !== 'erase' && tool !== 'spawn')
    ensure(
      layer === 'terrain'
        ? TERRAIN.includes(tool)
        : layer === 'decoration'
          ? BUILTIN_SKINS.includes(tool as (typeof BUILTIN_SKINS)[number])
          : !TERRAIN.includes(tool),
      '请在对应图层使用画笔',
    );
  for (const cell of cells) {
    const { x, y } = cell;
    ensure(
      Number.isSafeInteger(x) &&
        Number.isSafeInteger(y) &&
        x >= 0 &&
        y >= 0 &&
        x < room.width &&
        y < room.height,
      '画笔超出地图范围',
    );
    if (tool === 'spawn') {
      next.start = { roomId, x, y };
      continue;
    }
    if (layer === 'terrain') {
      room.tiles = room.tiles.filter((t) => t.x !== x || t.y !== y);
      if (tool !== 'erase') room.tiles.push({ x, y, kind: tool as TileKind });
    } else {
      const existing = room.objects.filter(
        (o) =>
          x >= o.x &&
          y >= o.y &&
          x < o.x + (o.width ?? 1) &&
          y < o.y + (o.height ?? 1) &&
          objectLayer(o) === layer,
      );
      if (tool === 'erase') {
        for (const o of existing) deleteFrom(next, o.id, false);
        if (
          layer === 'objects' &&
          next.start?.roomId === roomId &&
          next.start.x === x &&
          next.start.y === y
        )
          next.start = null;
      } else {
        ensure(
          !existing.length ||
            existing.every((o) => (layer === 'decoration' ? o.skin === tool : o.kind === tool)),
          '这个格子已有物体，请先选择或移走它',
        );
        if (!existing.length) room.objects.push(defaultObject(next, room, cell, tool, layer));
      }
    }
  }
  return validateAdventure(next);
}
export function updateObject(
  doc: AdventureDocument,
  id: string,
  patch: Partial<WorldObject>,
): AdventureDocument {
  ensure(!('id' in patch) && !('kind' in patch), '物体编号和种类不能直接更改');
  const next = structuredClone(doc),
    { object } = findObject(next, id);
  Object.assign(object, structuredClone(patch));
  return validateAdventure(next);
}
export function moveObject(
  doc: AdventureDocument,
  id: string,
  x: number,
  y: number,
): AdventureDocument {
  const { object } = findObject(doc, id);
  return updateObject(doc, id, {
    x,
    y,
    ...(object.route
      ? { route: { x: object.route.x + x - object.x, y: object.route.y + y - object.y } }
      : {}),
  });
}
export function copyObject(
  doc: AdventureDocument,
  id: string,
): { document: AdventureDocument; id: string } {
  const next = structuredClone(doc),
    { room, object } = findObject(next, id);
  const clone = structuredClone(object);
  clone.id = freshId(next, object.kind + '-copy');
  const positions = Array.from({ length: room.width * room.height }, (_, i) => ({
    x: (object.x + 1 + i) % room.width,
    y: (object.y + Math.floor((object.x + 1 + i) / room.width)) % room.height,
  }));
  const dx = clone.route ? clone.route.x - clone.x : 0,
    dy = clone.route ? clone.route.y - clone.y : 0;
  const width = clone.width ?? 1,
    height = clone.height ?? 1;
  const position = positions.find(
    (p) =>
      p.x + width <= room.width &&
      p.y + height <= room.height &&
      p.x + dx >= 0 &&
      p.y + dy >= 0 &&
      p.x + dx + width <= room.width &&
      p.y + dy + height <= room.height &&
      !room.objects.some(
        (o) =>
          objectLayer(o) === objectLayer(clone) &&
          p.x < o.x + (o.width ?? 1) &&
          p.x + width > o.x &&
          p.y < o.y + (o.height ?? 1) &&
          p.y + height > o.y,
      ),
  );
  ensure(position, '当前地图没有空位放置副本及其路线');
  if (clone.route) clone.route = { x: position.x + dx, y: position.y + dy };
  clone.x = position.x;
  clone.y = position.y;
  room.objects.push(clone);
  return { document: validateAdventure(next), id: clone.id };
}
export function resizeRoom(
  doc: AdventureDocument,
  roomId: string,
  width: number,
  height: number,
): AdventureDocument {
  const next = structuredClone(doc),
    room = next.rooms.find((r) => r.id === roomId);
  ensure(room, '房间不存在');
  room.width = width;
  room.height = height;
  return validateAdventure(next);
}
