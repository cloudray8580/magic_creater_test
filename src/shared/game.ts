export const LIMITS = {
  minSize: 4,
  maxSize: 16,
  title: 60,
  bodyBytes: 131072,
  history: 100,
} as const;
export type ObjectType = 'spawn' | 'goal' | 'wall' | 'collectible';
export type Tool = ObjectType | 'erase';
export interface LevelObject {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
}
export interface GameDocument {
  schemaVersion: 1;
  rulesVersion: 1;
  gameType: 'grid-exploration';
  assetPack: 'builtin-basic-v1';
  title: string;
  level: { width: number; height: number; objects: LevelObject[] };
  goal: { type: 'collect-all-and-reach-goal' };
}
export class ValidationError extends Error {}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ValidationError(message);
}
function record(value: unknown, keys: string[]): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), '数据必须是对象');
  check(
    Object.keys(value).every((key) => keys.includes(key)),
    '存在不支持的字段',
  );
  return value as Record<string, unknown>;
}
export function cloneDocument(doc: GameDocument): GameDocument {
  return structuredClone(doc);
}
export function validateDocument(value: unknown, playable = false): GameDocument {
  const doc = record(value, [
    'schemaVersion',
    'rulesVersion',
    'gameType',
    'assetPack',
    'title',
    'level',
    'goal',
  ]);
  check(doc.schemaVersion === 1 && doc.rulesVersion === 1, '不支持的作品版本');
  check(
    doc.gameType === 'grid-exploration' && doc.assetPack === 'builtin-basic-v1',
    '不支持的玩法或素材',
  );
  check(
    typeof doc.title === 'string' &&
      doc.title.trim().length > 0 &&
      doc.title.length <= LIMITS.title,
    '作品名称需要1至60个字符',
  );
  const goal = record(doc.goal, ['type']);
  check(goal.type === 'collect-all-and-reach-goal', '不支持的通关规则');
  const level = record(doc.level, ['width', 'height', 'objects']);
  for (const dimension of [level.width, level.height])
    check(
      Number.isInteger(dimension) &&
        (dimension as number) >= LIMITS.minSize &&
        (dimension as number) <= LIMITS.maxSize,
      '地图边长需要4至16格',
    );
  check(
    Array.isArray(level.objects) &&
      level.objects.length <= (level.width as number) * (level.height as number),
    '物体数量超过地图容量',
  );
  const ids = new Set<string>(),
    cells = new Set<string>();
  let starts = 0,
    goals = 0;
  for (const item of level.objects) {
    const obj = record(item, ['id', 'type', 'x', 'y']);
    check(
      typeof obj.id === 'string' && obj.id.length > 0 && obj.id.length <= 80 && !ids.has(obj.id),
      '物体编号重复或无效',
    );
    check(
      ['spawn', 'goal', 'wall', 'collectible'].includes(obj.type as string),
      '不支持的物体类型',
    );
    check(
      Number.isInteger(obj.x) &&
        Number.isInteger(obj.y) &&
        (obj.x as number) >= 0 &&
        (obj.y as number) >= 0 &&
        (obj.x as number) < (level.width as number) &&
        (obj.y as number) < (level.height as number),
      '物体位置超出地图',
    );
    const cell = obj.x + ',' + obj.y;
    check(!cells.has(cell), '同一格只能放置一个物体');
    cells.add(cell);
    ids.add(obj.id);
    if (obj.type === 'spawn') starts++;
    if (obj.type === 'goal') goals++;
  }
  check(starts <= 1 && goals <= 1, '起点和终点分别最多一个');
  if (playable) check(starts === 1 && goals === 1, '试玩或提交前，请放置一个起点和一个终点');
  return cloneDocument(value as GameDocument);
}
export function template(kind: 'garden' | 'corner' = 'garden'): GameDocument {
  const objects: LevelObject[] = [
    { id: 'spawn-1', type: 'spawn', x: 0, y: 0 },
    { id: 'goal-1', type: 'goal', x: 5, y: 5 },
    { id: 'flower-1', type: 'collectible', x: 5, y: 0 },
    { id: 'flower-2', type: 'collectible', x: 2, y: 3 },
  ];
  const walls =
    kind === 'garden'
      ? [
          [3, 0],
          [1, 1],
          [3, 1],
          [1, 2],
          [3, 3],
          [4, 3],
          [0, 4],
          [2, 5],
        ]
      : [
          [1, 0],
          [1, 1],
          [3, 2],
          [4, 2],
          [2, 4],
          [3, 4],
        ];
  walls.forEach(([x, y], i) => objects.push({ id: 'wall-' + i, type: 'wall', x, y }));
  return {
    schemaVersion: 1,
    rulesVersion: 1,
    gameType: 'grid-exploration',
    assetPack: 'builtin-basic-v1',
    title: kind === 'garden' ? '月光花园' : '转角的礼物',
    level: { width: 6, height: 6, objects },
    goal: { type: 'collect-all-and-reach-goal' },
  };
}
export function editCell(doc: GameDocument, x: number, y: number, tool: Tool): GameDocument {
  check(
    Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < doc.level.width &&
      y < doc.level.height,
    '位置超出地图',
  );
  check(['spawn', 'goal', 'wall', 'collectible', 'erase'].includes(tool), '不支持的工具');
  const next = cloneDocument(doc);
  next.level.objects = next.level.objects.filter(
    (o) => !(o.x === x && o.y === y) && !((tool === 'spawn' || tool === 'goal') && o.type === tool),
  );
  if (tool !== 'erase') {
    const base = tool + '-' + x + '-' + y;
    let id = base,
      index = 0;
    while (next.level.objects.some((o) => o.id === id)) id = base + '-' + ++index;
    next.level.objects.push({ id, type: tool, x, y });
  }
  return next;
}
export function editTitle(doc: GameDocument, title: string): GameDocument {
  return { ...cloneDocument(doc), title };
}
export interface History<T = GameDocument> {
  past: T[];
  present: T;
  future: T[];
}
export function createHistory<T>(doc: T): History<T> {
  return { past: [], present: structuredClone(doc), future: [] };
}
/** Clone changed branches but retain immutable equal branches across undo snapshots. */
function snapshotKey(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return;
  const row = value as Record<string, unknown>;
  if (typeof row.id === 'string') return 'id:' + row.id;
  if (typeof row.x === 'number' && typeof row.y === 'number') return 'cell:' + row.x + ',' + row.y;
}
function sharedSnapshot(previous: unknown, value: unknown): unknown {
  if (Object.is(previous, value)) return previous;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const prior = Array.isArray(previous) ? previous : [];
    const keyed = new Map(prior.map((item) => [snapshotKey(item), item]));
    const useKeys = prior.length > 0 && !keyed.has(undefined) && keyed.size === prior.length;
    const result = value.map((item, i) =>
      sharedSnapshot(useKeys ? keyed.get(snapshotKey(item)) : prior[i], item),
    );
    return Array.isArray(previous) &&
      result.length === prior.length &&
      result.every((item, i) => item === prior[i])
      ? previous
      : result;
  }
  const prior =
    previous && typeof previous === 'object' && !Array.isArray(previous)
      ? (previous as Record<string, unknown>)
      : {};
  const entries = Object.entries(value),
    result: Record<string, unknown> = {};
  let same = entries.length === Object.keys(prior).length;
  for (const [key, item] of entries) {
    result[key] = sharedSnapshot(prior[key], item);
    if (result[key] !== prior[key] || !Object.hasOwn(prior, key)) same = false;
  }
  return previous !== null && typeof previous === 'object' && !Array.isArray(previous) && same
    ? previous
    : result;
}
export function changeHistory<T>(history: History<T>, doc: T): History<T> {
  return {
    past: [...history.past, history.present].slice(-LIMITS.history),
    present: sharedSnapshot(history.present, doc) as T,
    future: [],
  };
}
export function undoHistory<T>(history: History<T>): History<T> {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past.at(-1)!,
    future: [history.present, ...history.future],
  };
}
export function redoHistory<T>(history: History<T>): History<T> {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  };
}
export interface GameState {
  document: GameDocument;
  x: number;
  y: number;
  collected: string[];
  won: boolean;
  steps: number;
}
export function startGame(doc: GameDocument): GameState {
  const document = validateDocument(doc, true),
    start = document.level.objects.find((o) => o.type === 'spawn')!;
  return { document, x: start.x, y: start.y, collected: [], won: false, steps: 0 };
}
export function movePlayer(state: GameState, dx: number, dy: number): GameState {
  if (
    state.won ||
    !Number.isInteger(dx) ||
    !Number.isInteger(dy) ||
    Math.abs(dx) + Math.abs(dy) !== 1
  )
    return state;
  const x = state.x + dx,
    y = state.y + dy,
    { width, height, objects } = state.document.level;
  if (x < 0 || y < 0 || x >= width || y >= height) return state;
  const object = objects.find((o) => o.x === x && o.y === y);
  if (object?.type === 'wall') return state;
  const collected =
    object?.type === 'collectible' && !state.collected.includes(object.id)
      ? [...state.collected, object.id]
      : state.collected;
  return {
    ...state,
    x,
    y,
    collected,
    steps: state.steps + 1,
    won:
      object?.type === 'goal' &&
      objects.filter((o) => o.type === 'collectible').every((o) => collected.includes(o.id)),
  };
}
