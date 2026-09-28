import { ValidationError } from '../game.js';

export const CELL_KINDS = [
  'road',
  'broken',
  'gap',
  'fire',
  'tree',
  'shade',
  'ice',
  'hat',
  'carrot',
] as const;
export type CellKind = (typeof CELL_KINDS)[number];
export const HAT_STYLES = ['berry', 'pine', 'star', 'wool'] as const;
export type HatStyle = (typeof HAT_STYLES)[number];
export interface Point {
  x: number;
  y: number;
}
export interface Cell extends Point {
  kind: CellKind;
}
export type Pickup =
  (Point & { kind: 'hat'; style: HatStyle }) | (Point & { kind: 'carrot' | 'snowball' });
export interface Materials {
  wood: number;
  water: number;
  signs: number;
  snowballs: number;
}
export interface SnowmanDocument {
  schemaVersion: 3;
  rulesVersion: 2;
  gameType: 'snowman';
  assetPack: 'winter-v1';
  title: string;
  description: string;
  width: number;
  height: number;
  cells: Cell[];
  pickups: Pickup[];
  start: Point | null;
  home: Point | null;
  mass: number;
  preparationSeconds: number;
  materials: Materials;
}
export function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new ValidationError(message);
}
export function record(v: unknown, keys: string[]): Record<string, unknown> {
  check(v && typeof v === 'object' && !Array.isArray(v), '数据必须是对象');
  check(
    Object.keys(v).every((k) => keys.includes(k)),
    '存在不支持的字段',
  );
  return v as Record<string, unknown>;
}
export function integer(v: unknown, min: number, max: number, label: string): number {
  check(Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max, label + '超出范围');
  return v as number;
}
export function point(v: unknown, w: number, h: number): Point {
  const p = record(v, ['x', 'y']);
  return { x: integer(p.x, 0, w - 1, '横坐标'), y: integer(p.y, 0, h - 1, '纵坐标') };
}
export const key = (p: Point) => p.x + ',' + p.y;
export function validateSnowman(v: unknown, playable = false): SnowmanDocument {
  const d = record(v, [
    'schemaVersion',
    'rulesVersion',
    'gameType',
    'assetPack',
    'title',
    'description',
    'width',
    'height',
    'cells',
    'pickups',
    'start',
    'home',
    'mass',
    'preparationSeconds',
    'materials',
  ]);
  check(
    d.schemaVersion === 3 &&
      (d.rulesVersion === 1 || d.rulesVersion === 2) &&
      d.gameType === 'snowman' &&
      d.assetPack === 'winter-v1',
    '不支持的雪人作品版本',
  );
  check(
    typeof d.title === 'string' && d.title.trim().length > 0 && d.title.length <= 60,
    '作品名称需要1至60个字符',
  );
  check(typeof d.description === 'string' && d.description.length <= 500, '介绍最多500字');
  const w = integer(d.width, 8, 128, '地图宽度');
  const h = integer(d.height, 8, 128, '地图高度');
  const mass = integer(d.mass, 1, 300, '初始体积');
  check(d.rulesVersion === 1 || d.preparationSeconds !== undefined, '缺少准备时间');
  const preparationSeconds = integer(d.preparationSeconds ?? 3, 0, 180, '准备时间');
  const m = record(d.materials, ['wood', 'water', 'signs', 'snowballs']);
  check(d.rulesVersion === 1 || m.snowballs !== undefined, '缺少雪球数量');
  const materials: Materials = {
    wood: integer(m.wood, 0, 200, '木材'),
    water: integer(m.water, 0, 200, '清水'),
    signs: integer(m.signs, 0, 200, '路牌'),
    snowballs: integer(m.snowballs ?? 0, 0, 200, '雪球'),
  };
  check(Array.isArray(d.cells) && d.cells.length <= w * h, '地图格子数量无效');
  const cells: Cell[] = [];
  const cellIndex = new Map<string, CellKind>();
  const legacyPickups: Pickup[] = [];
  for (const v of d.cells) {
    const c = record(v, ['x', 'y', 'kind']);
    const p = point({ x: c.x, y: c.y }, w, h);
    check(!cellIndex.has(key(p)), '地图格子不能重叠');
    if (d.rulesVersion === 2)
      check(c.kind !== 'hat' && c.kind !== 'carrot', '新版拾取物请使用独立图层');
    const kind = c.kind === 'hat' || c.kind === 'carrot' ? 'road' : c.kind;
    check(CELL_KINDS.includes(kind as CellKind), '不支持的格子');
    if (c.kind === 'hat') legacyPickups.push({ ...p, kind: 'hat', style: 'berry' });
    if (c.kind === 'carrot') legacyPickups.push({ ...p, kind: 'carrot' });
    cellIndex.set(key(p), kind as CellKind);
    cells.push({ ...p, kind: kind as CellKind });
  }
  check(d.rulesVersion === 1 || d.pickups !== undefined, '缺少拾取物列表');
  check(
    Array.isArray(d.pickups ?? []) && ((d.pickups as unknown[] | undefined) ?? []).length <= w * h,
    '拾取物数量无效',
  );
  const pickups = [...legacyPickups];
  const seen = new Set(pickups.map(key));
  for (const v of (d.pickups ?? []) as unknown[]) {
    const p = record(v, ['x', 'y', 'kind', 'style']);
    const at = point({ x: p.x, y: p.y }, w, h);
    check(!seen.has(key(at)), '同一格只能放一个拾取物');
    check(
      cellIndex.has(key(at)) && !['tree', 'broken', 'gap'].includes(cellIndex.get(key(at))!),
      '拾取物需要放在可行走道路上',
    );
    check(['hat', 'carrot', 'snowball'].includes(p.kind as string), '不支持的拾取物');
    if (p.kind === 'hat') {
      check(HAT_STYLES.includes(p.style as HatStyle), '不支持的帽子样式');
      pickups.push({ ...at, kind: 'hat', style: p.style as HatStyle });
    } else {
      check(p.style === undefined, '这个拾取物不需要样式');
      pickups.push({ ...at, kind: p.kind as 'carrot' | 'snowball' });
    }
    seen.add(key(at));
  }
  check(pickups.filter((p) => p.kind === 'hat').length <= 64, '帽子最多64顶');
  const endpoints: { start: Point | null; home: Point | null } = { start: null, home: null };
  for (const name of ['start', 'home'] as const) {
    if (d[name] === null) {
      check(!playable, '请放置雪人和家');
      continue;
    }
    const p = point(d[name], w, h);
    check(cellIndex.get(key(p)) === 'road', '雪人和家需要放在普通道路上');
    endpoints[name] = p;
  }
  check(
    !endpoints.start || !endpoints.home || key(endpoints.start) !== key(endpoints.home),
    '雪人和家不能在同一格',
  );
  return {
    schemaVersion: 3,
    rulesVersion: 2,
    gameType: 'snowman',
    assetPack: 'winter-v1',
    title: d.title as string,
    description: d.description as string,
    width: w,
    height: h,
    cells,
    pickups,
    ...endpoints,
    mass,
    preparationSeconds,
    materials,
  };
}
