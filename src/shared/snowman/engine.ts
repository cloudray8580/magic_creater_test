import {
  check,
  key,
  integer,
  point,
  record,
  validateSnowman,
  type SnowmanDocument,
  type Point,
  type CellKind,
} from './document.js';
export const DIRECTIONS = {
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
} as const;
export type Direction = keyof typeof DIRECTIONS;
export type Tool = 'repair' | 'bridge' | 'water' | 'sign' | 'skis' | 'snowball';
export interface Placement extends Point {
  tool: Tool;
  direction?: Direction;
}
export type Plan = Placement[];
export interface Frame extends Point {
  time: number;
  mass: number;
  hats: number;
  carrot: boolean;
  ski: boolean;
}
// V2: deterministic forty-step clock. Only accepted, time-stamped actions are proof.
export const TICKS_PER_SECOND = 40;
export type LiveTool = Tool | 'snowball';
export type LiveAction =
  | { type: 'place'; tool: LiveTool; x: number; y: number; direction?: Direction }
  | { type: 'remove'; tool: Exclude<LiveTool, 'water'>; x: number; y: number }
  | { type: 'depart' };
export interface TimedAction {
  tick: number;
  action: LiveAction;
}
export interface LiveRun {
  document: SnowmanDocument;
  cellIndex: Map<string, CellKind>;
  pickupIndex: Map<string, SnowmanDocument['pickups'][number]>;
  placementIndex: Map<string, Placement>;
  routeCache: Point[];
  searchWork: number;
  searchLimit: number;
  phase: 'prep' | 'run' | 'won' | 'lost';
  tick: number;
  cell: Point;
  target: Point | null;
  progress: number;
  mass: number;
  inventory: SnowmanDocument['materials'];
  hats: string[];
  carrot: boolean;
  ski: boolean;
  placements: Placement[];
  used: Set<string>;
  collected: Set<string>;
  visited: Set<string>;
  actions: TimedAction[];
  routeDirty: boolean;
  reason: string;
}
function originalKind(s: LiveRun, p: Point): CellKind | undefined {
  return s.cellIndex.get(key(p));
}
function placed(s: LiveRun, tool: LiveTool, p: Point): boolean {
  return s.placementIndex.has(key(p) + ':' + tool);
}
function passable(s: LiveRun, p: Point, potential = false): boolean {
  const kind = originalKind(s, p);
  if (!kind || kind === 'tree') return false;
  if (kind === 'broken') return potential || placed(s, 'repair', p);
  if (kind === 'gap') return potential || placed(s, 'bridge', p);
  return true;
}
function routeFrom(s: LiveRun, potential: boolean, meter: boolean): Point[] {
  const start = s.cell,
    end = s.document.home!;
  const queue = [start],
    parents = new Map<string, Point | null>([[key(start), null]]);
  for (let i = 0; i < queue.length && !parents.has(key(end)); i++) {
    if (meter) check(++s.searchWork <= s.searchLimit, '路线搜索超出预算');
    const here = queue[i];
    const sign = s.placementIndex.get(key(here) + ':sign')?.direction;
    for (const dir of sign ? [sign] : (Object.keys(DIRECTIONS) as Direction[])) {
      const v = DIRECTIONS[dir!],
        next = { x: here.x + v.x, y: here.y + v.y },
        k = key(next);
      if (!parents.has(k) && passable(s, next, potential)) {
        parents.set(k, here);
        queue.push(next);
      }
    }
  }
  if (!parents.has(key(end))) return [];
  const route: Point[] = [];
  let cursor: Point | null = end;
  while (cursor) {
    route.push(cursor);
    cursor = parents.get(key(cursor))!;
  }
  return route.reverse();
}
export function liveRoute(s: LiveRun, meter = true): Point[] {
  const open = routeFrom(s, false, meter);
  return open.length ? open : routeFrom(s, true, meter);
}
function pickup(s: LiveRun, at: Point) {
  const k = key(at);
  const item = s.pickupIndex.get(k);
  if (item && !s.collected.has(k)) {
    if (item.kind === 'hat') s.hats.push(item.style);
    if (item.kind === 'carrot') s.carrot = true;
    if (item.kind === 'snowball') s.mass = Math.min(s.document.mass * 1.5, s.mass + 8);
    s.collected.add(k);
  }
  if (placed(s, 'snowball', at) && !s.used.has(k + ':snowball')) {
    s.mass = Math.min(s.document.mass * 1.5, s.mass + 8);
    s.used.add(k + ':snowball');
    s.collected.add(k);
  }
  if (placed(s, 'skis', at) && !s.used.has(k + ':skis')) {
    s.ski = true;
    s.used.add(k + ':skis');
    s.collected.add(k);
  }
}
export function createRun(document: SnowmanDocument): LiveRun {
  const d = validateSnowman(document, true);
  const s: LiveRun = {
    document: d,
    cellIndex: new Map(d.cells.map((c) => [key(c), c.kind])),
    pickupIndex: new Map(d.pickups.map((p) => [key(p), p])),
    placementIndex: new Map(),
    routeCache: [],
    searchWork: 0,
    searchLimit: 5_000_000,
    phase: d.preparationSeconds ? 'prep' : 'run',
    tick: 0,
    cell: { ...d.start! },
    target: null,
    progress: 0,
    mass: d.mass,
    inventory: { ...d.materials },
    hats: [],
    carrot: false,
    ski: false,
    placements: [],
    used: new Set(),
    collected: new Set(),
    visited: new Set([key(d.start!)]),
    actions: [],
    routeDirty: true,
    reason: '',
  };
  pickup(s, s.cell);
  return s;
}
function actionShape(raw: unknown, s: LiveRun): LiveAction {
  const a = record(raw, ['type', 'tool', 'x', 'y', 'direction']);
  check(a.type === 'place' || a.type === 'remove' || a.type === 'depart', '不支持的操作');
  if (a.type === 'depart') {
    check(Object.keys(a).length === 1, '出发操作不能有其他字段');
    return { type: 'depart' };
  }
  check(
    ['repair', 'bridge', 'water', 'sign', 'skis', 'snowball'].includes(a.tool as string),
    '不支持的工具',
  );
  const at = point({ x: a.x, y: a.y }, s.document.width, s.document.height);
  if (a.type === 'remove') {
    check(a.tool !== 'water' && a.direction === undefined, '这个操作不可撤销');
    return { type: 'remove', tool: a.tool as Exclude<LiveTool, 'water'>, ...at };
  }
  if (a.tool === 'sign') check(Object.hasOwn(DIRECTIONS, a.direction as string), '请指定路牌方向');
  else check(a.direction === undefined, '这个工具不需要方向');
  return {
    type: 'place',
    tool: a.tool as LiveTool,
    ...at,
    ...(a.tool === 'sign' ? { direction: a.direction as Direction } : {}),
  };
}
export function perform(s: LiveRun, raw: unknown): void {
  check(s.phase === 'prep' || s.phase === 'run', '旅程已经结束');
  check(s.actions.length < 800, '操作次数过多');
  const a = actionShape(raw, s);
  if (a.type === 'depart') {
    check(s.phase === 'prep', '雪人已经出发');
    s.phase = 'run';
    pickup(s, s.cell);
  } else {
    const p = { x: a.x, y: a.y },
      k = key(p);
    const kind = originalKind(s, p);
    check(kind !== undefined && kind !== 'tree', '请在地图道路上布置');
    if (s.phase === 'run' && a.type === 'place')
      check(!s.visited.has(k) && (!s.target || key(s.target) !== k), '只能在雪人前方布置');
    if (a.type === 'remove') {
      const i = s.placements.findIndex((v) => v.tool === a.tool && key(v) === k);
      check(i >= 0 && !s.used.has(k + ':' + a.tool), '这个道具已经使用，不能收回');
      s.placements.splice(i, 1);
      s.placementIndex.delete(k + ':' + a.tool);
      if (a.tool === 'bridge') s.inventory.wood += 2;
      else if (a.tool === 'repair') s.inventory.wood++;
      else if (a.tool === 'skis') s.inventory.wood += 2;
      else if (a.tool === 'sign') s.inventory.signs++;
      else s.inventory.snowballs++;
    } else {
      check(!placed(s, a.tool, p), '同一格不能重复放置同种工具');
      const overlay = a.tool === 'repair' || a.tool === 'bridge' || a.tool === 'water';
      if (a.tool === 'repair') check(kind === 'broken', '修路工具只能用于破路');
      if (a.tool === 'bridge') check(kind === 'gap', '桥只能架在断桥格');
      if (a.tool === 'water') check(kind === 'fire', '水只能用于火堆');
      if (!overlay) {
        check(passable(s, p), '请先修通道路再放置道具');
        check(
          a.tool !== 'snowball' ||
            (!s.document.pickups.some((v) => key(v) === k) && !placed(s, 'skis', p)),
          '这里已有拾取物',
        );
        check(a.tool !== 'skis' || !placed(s, 'snowball', p), '这里已有雪球');
      }
      const cost = a.tool === 'bridge' || a.tool === 'skis' ? 2 : 1;
      const supply =
        a.tool === 'water'
          ? 'water'
          : a.tool === 'sign'
            ? 'signs'
            : a.tool === 'snowball'
              ? 'snowballs'
              : 'wood';
      check(s.inventory[supply] >= cost, '材料不足');
      s.inventory[supply] -= cost;
      s.placements.push(a);
      s.placementIndex.set(k + ':' + a.tool, a);
      if (a.tool === 'water') s.used.add(k + ':water');
    }
  }
  s.routeDirty = true;
  s.actions.push({ tick: s.tick, action: a });
}
function advanceOne(s: LiveRun): void {
  if (s.phase === 'won' || s.phase === 'lost') return;
  s.tick++;
  if (s.phase === 'prep') {
    if (s.tick >= s.document.preparationSeconds * TICKS_PER_SECOND) {
      s.phase = 'run';
      pickup(s, s.cell);
    }
    return;
  }
  if (!s.target) {
    if (s.routeDirty) {
      s.routeCache = liveRoute(s);
      s.routeDirty = false;
    }
    const route = s.routeCache;
    if (route.length > 1 && passable(s, route[1])) {
      s.target = route[1];
      s.progress = 0;
      const k = key(s.target);
      if (placed(s, 'sign', s.cell)) s.used.add(key(s.cell) + ':sign');
      if (placed(s, 'bridge', s.target)) s.used.add(k + ':bridge');
      if (placed(s, 'repair', s.target)) s.used.add(k + ':repair');
    }
  }
  const kind = originalKind(s, s.cell);
  const activeFire = kind === 'fire' && !placed(s, 'water', s.cell);
  const rate = activeFire ? 7 : kind === 'shade' ? 0.5 : 1;
  s.mass = Math.max(0, s.mass - rate / TICKS_PER_SECOND);
  if (s.mass <= 0) {
    s.phase = 'lost';
    s.reason = activeFire ? '火堆让雪人融化了。试试提前灭火。' : '雪人在到家前融化了。';
    return;
  }
  if (!s.target) return;
  const speed = (s.ski ? 2 : 1) * (kind === 'ice' ? 1.5 : 1);
  s.progress += speed / (0.65 * TICKS_PER_SECOND);
  if (s.progress >= 1 - 1e-9) {
    s.cell = s.target;
    s.target = null;
    s.progress = 0;
    if (!s.routeDirty && s.routeCache[1] && key(s.routeCache[1]) === key(s.cell))
      s.routeCache.shift();
    else s.routeDirty = true;
    s.visited.add(key(s.cell));
    if (placed(s, 'sign', s.cell)) s.used.add(key(s.cell) + ':sign');
    pickup(s, s.cell);
    if (key(s.cell) === key(s.document.home!)) {
      s.phase = 'won';
      s.reason = '雪人平安到家了！';
    }
  }
}
export function advance(s: LiveRun, ticks = 1): LiveRun {
  check(Number.isSafeInteger(ticks) && ticks >= 0 && ticks <= 50000, '时间步数无效');
  for (let i = 0; i < ticks && (s.phase === 'prep' || s.phase === 'run'); i++) advanceOne(s);
  return s;
}
export interface ReplayResult {
  status: 'won' | 'lost';
  reason: string;
  run: LiveRun;
}
export function replay(document: SnowmanDocument, value: unknown): ReplayResult {
  const s = createRun(document);
  check(Array.isArray(value) && value.length <= 800, '操作记录数量无效');
  let previous = -1;
  for (const raw of value) {
    const e = record(raw, ['tick', 'action']);
    const tick = integer(e.tick, 0, 50000, '操作时间');
    check(tick >= previous, '操作时间必须递增');
    previous = tick;
    advance(s, tick - s.tick);
    check(s.tick === tick && (s.phase === 'prep' || s.phase === 'run'), '旅程结束后的操作无效');
    perform(s, e.action);
  }
  advance(s, 50000 - s.tick);
  return { status: s.phase === 'won' ? 'won' : 'lost', reason: s.reason, run: s };
}
export function liveFrame(s: LiveRun): Frame {
  const p = s.target
    ? {
        x: s.cell.x + (s.target.x - s.cell.x) * s.progress,
        y: s.cell.y + (s.target.y - s.cell.y) * s.progress,
      }
    : s.cell;
  return {
    ...p,
    time: s.tick / TICKS_PER_SECOND,
    mass: s.mass,
    hats: s.hats.length,
    carrot: s.carrot,
    ski: s.ski,
  };
}
