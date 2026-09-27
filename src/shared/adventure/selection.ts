import { validateCreative } from '../creative.js';
import { ensure, type AdventureDocument, type WorldObject } from './document.js';
import { objectLayer, referencesTo, removeObjects, type EditLayer, type Cell } from './editor.js';
export interface WorldSelection {
  roomId: string;
  layer: EditLayer;
  objectIds: string[];
  tiles: Cell[];
  includesStart: boolean;
}
interface Rect extends Cell {
  width: number;
  height: number;
}
const footprint = (o: Cell & { width?: number; height?: number }): Rect => ({
  x: o.x,
  y: o.y,
  width: o.width ?? 1,
  height: o.height ?? 1,
});
const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
function selectedRoom(doc: AdventureDocument, s: WorldSelection) {
  const room = doc.rooms.find((r) => r.id === s.roomId);
  ensure(room, '房间不存在');
  return room;
}
export function selectArea(
  doc: AdventureDocument,
  roomId: string,
  layer: EditLayer,
  a: Cell,
  b: Cell,
): WorldSelection {
  ensure([a.x, a.y, b.x, b.y].every(Number.isSafeInteger), '框选坐标必须为整数');
  const s: WorldSelection = { roomId, layer, objectIds: [], tiles: [], includesStart: false };
  const r = selectedRoom(doc, s),
    x = Math.max(0, Math.min(a.x, b.x)),
    y = Math.max(0, Math.min(a.y, b.y));
  const rect = {
    x,
    y,
    width: Math.min(r.width - 1, Math.max(a.x, b.x)) - x + 1,
    height: Math.min(r.height - 1, Math.max(a.y, b.y)) - y + 1,
  };
  if (rect.width <= 0 || rect.height <= 0) return s;
  if (layer === 'terrain')
    s.tiles = r.tiles.filter((t) => intersects(rect, footprint(t))).map(({ x, y }) => ({ x, y }));
  else {
    s.objectIds = r.objects
      .filter((o) => objectLayer(o) === layer && intersects(rect, footprint(o)))
      .map((o) => o.id);
    s.includesStart =
      layer === 'objects' && doc.start?.roomId === roomId && intersects(rect, footprint(doc.start));
  }
  return s;
}
function selectedParts(doc: AdventureDocument, s: WorldSelection) {
  const r = selectedRoom(doc, s),
    objects = r.objects.filter((o) => s.objectIds.includes(o.id)),
    tiles = r.tiles.filter((t) => s.tiles.some((p) => sameCell(p, t)));
  ensure(
    objects.length === s.objectIds.length &&
      tiles.length === s.tiles.length &&
      objects.every((o) => objectLayer(o) === s.layer) &&
      (!s.tiles.length || s.layer === 'terrain') &&
      (!s.includesStart || (s.layer === 'objects' && doc.start?.roomId === r.id)),
    '选区已变化，请重新框选',
  );
  return { r, objects, tiles, start: s.includesStart ? doc.start! : null };
}
export function selectionBounds(doc: AdventureDocument, s: WorldSelection): Rect | null {
  const { objects, tiles, start } = selectedParts(doc, s),
    rects = [...objects, ...tiles, ...(start ? [start] : [])].map(footprint);
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
}
export function transformSelection(
  doc: AdventureDocument,
  s: WorldSelection,
  dx: number,
  dy: number,
  copy: boolean,
): { document: AdventureDocument; selection: WorldSelection } {
  ensure(Number.isSafeInteger(dx) && Number.isSafeInteger(dy), '移动距离必须为整数');
  const { r, objects, tiles, start } = selectedParts(doc, s);
  ensure(objects.length || tiles.length || start, '选区为空，请先框选');
  ensure(!copy || objects.length || tiles.length, '起点只有一个，不能复制；请框选其他内容');
  const shift = <T extends Cell>(p: T): T => ({ ...p, x: p.x + dx, y: p.y + dy });
  const shiftedObjects = objects.map((o) => ({
    ...structuredClone(o),
    ...shift(o),
    ...(o.route ? { route: shift(o.route) } : {}),
  }));
  // Detach nested dialogue/conditions before rewriting copy links.
  const moving: WorldObject[] = structuredClone(shiftedObjects);
  const movingTiles = tiles.map(shift),
    movingStart = start && !copy ? shift(start) : null;
  const inside = (rect: Rect) =>
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= r.width &&
    rect.y + rect.height <= r.height;
  const destinations = [...moving, ...movingTiles, ...(movingStart ? [movingStart] : [])].map(
    footprint,
  );
  ensure(
    destinations.every(inside) &&
      moving.every((o) => !o.route || inside({ ...footprint(o), ...o.route })),
    '选区或移动路线超出地图范围',
  );
  const others =
    s.layer === 'terrain'
      ? r.tiles.filter((t) => copy || !s.tiles.some((p) => sameCell(t, p))).map(footprint)
      : [
          ...r.objects
            .filter((o) => objectLayer(o) === s.layer && (copy || !s.objectIds.includes(o.id)))
            .map(footprint),
          ...(s.layer === 'objects' && doc.start?.roomId === r.id && (copy || !s.includesStart)
            ? [footprint(doc.start)]
            : []),
        ];
  ensure(
    !destinations.some((p) => others.some((o) => intersects(p, o))),
    '目标位置已有同层内容，请选择空位',
  );
  const next = structuredClone(doc),
    room = next.rooms.find((room) => room.id === r.id)!;
  const result: WorldSelection = {
    ...structuredClone(s),
    tiles: movingTiles.map(({ x, y }) => ({ x, y })),
    includesStart: !!movingStart,
  };
  if (copy) {
    const used = new Set(next.rooms.flatMap((r) => r.objects.map((o) => o.id))),
      ids = new Map<string, string>();
    for (const o of moving) {
      let n = 1,
        id = o.kind + '-group-' + n;
      while (used.has(id)) id = o.kind + '-group-' + ++n;
      used.add(id);
      ids.set(o.id, id);
    }
    const remap = (id: string) => ids.get(id) ?? id;
    for (const o of moving) {
      o.id = remap(o.id);
      if (o.condition) o.condition.sources = o.condition.sources.map(remap);
      for (const p of o.dialogue ?? []) {
        if (p.condition) p.condition.sources = p.condition.sources.map(remap);
        for (const c of p.choices) {
          if (c.giveItem) c.giveItem = remap(c.giveItem);
          if (c.takeItem) c.takeItem = remap(c.takeItem);
        }
      }
    }
    result.objectIds = moving.map((o) => o.id);
  } else {
    room.objects = room.objects.filter((o) => !s.objectIds.includes(o.id));
    room.tiles = room.tiles.filter((t) => !s.tiles.some((p) => sameCell(t, p)));
  }
  room.objects.push(...moving);
  room.tiles.push(...movingTiles);
  if (movingStart) next.start = movingStart;
  return { document: validateCreative(next) as AdventureDocument, selection: result };
}
export function deleteSelection(
  doc: AdventureDocument,
  s: WorldSelection,
  clearReferences = false,
): AdventureDocument {
  const { objects, tiles, start } = selectedParts(doc, s);
  ensure(objects.length || tiles.length || start, '选区为空，请先框选');
  const external = s.objectIds
    .flatMap((id) => referencesTo(doc, id))
    .filter((id) => !s.objectIds.includes(id));
  ensure(clearReferences || !external.length, '选区被外部机关或对话引用，请确认清理连接');
  const next = removeObjects(doc, s.objectIds, true),
    room = selectedRoom(next, s);
  room.tiles = room.tiles.filter((t) => !s.tiles.some((p) => sameCell(t, p)));
  if (s.includesStart) next.start = null;
  return validateCreative(next) as AdventureDocument;
}
