/** Versioned content only. Live positions, inventory and timers never enter this document. */
export type GameKind = 'platformer' | 'story';
export type TileKind = 'solid' | 'oneway' | 'water';
export type ObjectKind =
  | 'goal'
  | 'collectible'
  | 'key'
  | 'checkpoint'
  | 'spring'
  | 'mover'
  | 'switch'
  | 'door'
  | 'hazard'
  | 'patrol'
  | 'box'
  | 'plate'
  | 'portal'
  | 'npc'
  | 'sign'
  | 'decoration';
export interface Location {
  roomId: string;
  x: number;
  y: number;
}
export interface Condition {
  mode: 'all' | 'any';
  sources: string[];
}
export interface Choice {
  label: string;
  next?: string;
  setFlag?: string;
  takeItem?: string;
  giveItem?: string;
  ending?: string;
}
export interface DialoguePage {
  id: string;
  text: string;
  condition?: Condition;
  choices: Choice[];
}
export interface WorldObject {
  id: string;
  kind: ObjectKind;
  x: number;
  y: number;
  name?: string;
  skin?: string;
  width?: number;
  height?: number;
  required?: boolean;
  condition?: Condition;
  target?: Location;
  route?: { x: number; y: number };
  speed?: 'slow' | 'normal' | 'fast';
  seconds?: number;
  text?: string;
  ending?: string;
  dialogue?: DialoguePage[];
}
export interface Room {
  id: string;
  name: string;
  width: number;
  height: number;
  ground: 'grass' | 'stone' | 'wood';
  tiles: { x: number; y: number; kind: TileKind }[];
  objects: WorldObject[];
}
export interface AdventureDocument {
  schemaVersion: 2;
  rulesVersion: 1;
  gameType: GameKind;
  assetPack: 'storybook-v1';
  title: string;
  description: string;
  theme: 'forest' | 'dusk' | 'cottage';
  music: 'meadow' | 'night' | 'none';
  hero: { skin: string; tint: string; accessory: 'none' | 'scarf' | 'hat' };
  flags: string[];
  rooms: Room[];
  start: Location | null;
}
export const WORLD_LIMITS = {
  rooms: 6,
  objects: 300,
  tiles: 4096,
  flags: 32,
  assets: 16,
  history: 100,
} as const;
export const BUILTIN_SKINS = [
  'fox',
  'cat',
  'robot',
  'bird',
  'tree',
  'flower',
  'rock',
  'lamp',
  'house',
  'mushroom',
  'bench',
  'mailbox',
  'letter',
  'battery',
] as const;
export class AdventureValidationError extends Error {}
export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AdventureValidationError(message);
}
function object(value: unknown, keys: string[], label: string) {
  ensure(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    label + '必须是对象',
  );
  ensure(
    Object.keys(value).every((k) => keys.includes(k)),
    label + '有不支持的字段',
  );
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, label: string, min = 0): string {
  ensure(
    typeof value === 'string' && value.trim().length >= min && value.length <= max,
    label + '长度无效',
  );
  return value;
}
function integer(value: unknown, min: number, max: number, label: string): number {
  ensure(
    Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max,
    label + '超出范围',
  );
  return value as number;
}
function member<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  ensure(typeof value === 'string' && choices.includes(value as T), label + '不支持');
  return value as T;
}
function id(value: unknown, label: string): string {
  const result = text(value, 80, label, 1);
  ensure(
    /^[a-zA-Z0-9_-]+$/.test(result) &&
      !Object.getOwnPropertyNames(Object.prototype).includes(result),
    label + '格式无效',
  );
  return result;
}
function array(value: unknown, max: number, label: string): unknown[] {
  ensure(Array.isArray(value) && value.length <= max, label + '数量超出范围');
  return value;
}
function skin(value: unknown) {
  ensure(
    typeof value === 'string' &&
      (BUILTIN_SKINS.includes(value as (typeof BUILTIN_SKINS)[number]) ||
        /^asset:[a-zA-Z0-9_-]{1,80}$/.test(value)),
    '角色素材无效',
  );
}
const EXTRAS: Record<ObjectKind, string[]> = {
  goal: ['condition', 'ending'],
  collectible: ['required'],
  key: [],
  checkpoint: [],
  spring: [],
  mover: ['route', 'speed', 'width'],
  switch: ['seconds'],
  door: ['condition', 'width', 'height'],
  hazard: ['width', 'height'],
  patrol: ['route', 'speed'],
  box: [],
  plate: [],
  portal: ['target'],
  npc: ['dialogue'],
  sign: ['text'],
  decoration: ['width', 'height'],
};
function validateCondition(value: unknown, ids: Map<string, WorldObject>, flags: string[]) {
  const c = object(value, ['mode', 'sources'], '条件');
  member(c.mode, ['all', 'any'], '条件关系');
  const sources = array(c.sources, 8, '条件');
  const unique = new Set<string>();
  for (const source of sources) {
    ensure(typeof source === 'string' && !unique.has(source), '条件来源重复或无效');
    unique.add(source);
    if (source.startsWith('flag:'))
      ensure(flags.includes(source.slice(5)), '条件引用不存在的故事标记');
    else
      ensure(
        ['collectible', 'key', 'switch', 'plate'].includes(ids.get(source)?.kind ?? ''),
        '条件引用不存在或不支持的物体',
      );
  }
}
export function isSolidAt(room: Room, x: number, y: number): boolean {
  return (
    x < 0 ||
    y < 0 ||
    x >= room.width ||
    y >= room.height ||
    room.tiles.some((t) => t.x === x && t.y === y && (t.kind === 'solid' || t.kind === 'water'))
  );
}
function location(value: unknown, rooms: Room[], label: string, standable: boolean) {
  const p = object(value, ['roomId', 'x', 'y'], label);
  const room = rooms.find((r) => r.id === p.roomId);
  ensure(room, label + '引用不存在的房间');
  const x = integer(p.x, 0, room.width - 1, label + '横坐标');
  const y = integer(p.y, 0, room.height - 1, label + '纵坐标');
  if (standable)
    ensure(
      !isSolidAt(room, x, y) &&
        !room.objects.some(
          (o) =>
            (['box', 'hazard', 'npc'].includes(o.kind) ||
              (o.kind === 'door' && Boolean(o.condition?.sources.length))) &&
            x >= o.x &&
            x < o.x + (o.width ?? 1) &&
            y >= o.y &&
            y < o.y + (o.height ?? 1),
        ),
      label + '需要空闲的落点',
    );
}
export function assetReferences(doc: AdventureDocument): string[] {
  return [
    ...new Set(
      [doc.hero.skin, ...doc.rooms.flatMap((r) => r.objects.map((o) => o.skin ?? ''))]
        .filter((s) => s.startsWith('asset:'))
        .map((s) => s.slice(6)),
    ),
  ];
}
export function validateAdventure(value: unknown, playable = false): AdventureDocument {
  const d = object(
    value,
    [
      'schemaVersion',
      'rulesVersion',
      'gameType',
      'assetPack',
      'title',
      'description',
      'theme',
      'music',
      'hero',
      'flags',
      'rooms',
      'start',
    ],
    '作品',
  );
  ensure(
    d.schemaVersion === 2 && d.rulesVersion === 1 && d.assetPack === 'storybook-v1',
    '不支持的作品或规则版本',
  );
  const kind = member(d.gameType, ['platformer', 'story'], '玩法');
  text(d.title, 60, '作品名称', 1);
  text(d.description, 240, '作品说明');
  member(d.theme, ['forest', 'dusk', 'cottage'], '主题');
  member(d.music, ['meadow', 'night', 'none'], '音乐');
  const hero = object(d.hero, ['skin', 'tint', 'accessory'], '主角');
  skin(hero.skin);
  ensure(typeof hero.tint === 'string' && /^#[a-fA-F0-9]{6}$/.test(hero.tint), '角色颜色无效');
  member(hero.accessory, ['none', 'scarf', 'hat'], '角色配件');
  const flags = array(d.flags, WORLD_LIMITS.flags, '故事标记');
  ensure(
    flags.every((f) => typeof f === 'string' && /^[\p{L}\p{N}_-]{1,40}$/u.test(f)) &&
      new Set(flags).size === flags.length,
    '故事标记重复或无效',
  );
  const rawRooms = array(d.rooms, kind === 'platformer' ? 1 : WORLD_LIMITS.rooms, '房间');
  ensure(rawRooms.length > 0, '至少需要一个房间');
  const roomIds = new Set<string>(),
    ids = new Map<string, WorldObject>();
  let tileCount = 0;
  for (const raw of rawRooms) {
    const r = object(raw, ['id', 'name', 'width', 'height', 'ground', 'tiles', 'objects'], '房间');
    const roomId = id(r.id, '房间编号');
    ensure(!roomIds.has(roomId), '房间编号重复');
    roomIds.add(roomId);
    text(r.name, 40, '房间名称', 1);
    const width = integer(r.width, 4, kind === 'platformer' ? 128 : 32, '地图宽度');
    const height = integer(r.height, 4, kind === 'platformer' ? 32 : 24, '地图高度');
    member(r.ground, ['grass', 'stone', 'wood'], '地面');
    const tiles = array(r.tiles, WORLD_LIMITS.tiles, '地形');
    tileCount += tiles.length;
    const cells = new Set<string>();
    for (const rawTile of tiles) {
      const t = object(rawTile, ['x', 'y', 'kind'], '地形');
      const x = integer(t.x, 0, width - 1, '地形横坐标'),
        y = integer(t.y, 0, height - 1, '地形纵坐标');
      member(
        t.kind,
        kind === 'story' ? ['solid', 'water'] : ['solid', 'water', 'oneway'],
        '地形种类',
      );
      ensure(!cells.has(x + ',' + y), '地形位置重复');
      cells.add(x + ',' + y);
    }
    for (const rawObj of array(r.objects, WORLD_LIMITS.objects, '物体')) {
      ensure(rawObj !== null && typeof rawObj === 'object', '物体无效');
      const type = member(
        (rawObj as WorldObject).kind,
        Object.keys(EXTRAS) as ObjectKind[],
        '物体',
      );
      const o = object(rawObj, ['id', 'kind', 'x', 'y', 'name', 'skin', ...EXTRAS[type]], '物体');
      const oid = id(o.id, '物体编号');
      ensure(!ids.has(oid), '物体编号重复');
      integer(o.x, 0, width - 1, '物体横坐标');
      integer(o.y, 0, height - 1, '物体纵坐标');
      if (o.name !== undefined) text(o.name, 40, '物体名称', 1);
      if (o.skin !== undefined) skin(o.skin);
      if (o.width !== undefined)
        integer(o.width, 1, Math.min(12, width - (o.x as number)), '物体宽度');
      if (o.height !== undefined)
        integer(o.height, 1, Math.min(12, height - (o.y as number)), '物体高度');
      if (o.required !== undefined) ensure(typeof o.required === 'boolean', '必需收集设置无效');
      if (o.speed !== undefined) member(o.speed, ['slow', 'normal', 'fast'], '速度');
      if (o.seconds !== undefined) integer(o.seconds, 0, 30, '开启时间');
      if (o.text !== undefined) text(o.text, 240, '文字');
      if (o.ending !== undefined) text(o.ending, 240, '结局');
      if (o.route !== undefined) {
        const route = object(o.route, ['x', 'y'], '路线');
        integer(route.x, 0, width - ((o.width as number) ?? 1), '路线横坐标');
        integer(route.y, 0, height - 1, '路线纵坐标');
      }
      if (kind === 'story')
        ensure(
          !['checkpoint', 'spring', 'mover', 'patrol', 'hazard'].includes(type),
          '探索玩法不支持该物体',
        );
      if (kind === 'platformer')
        ensure(!['box', 'plate', 'portal', 'npc'].includes(type), '横版玩法不支持该物体');
      if (playable && ['mover', 'patrol'].includes(type)) ensure(o.route, '请设置移动路线');
      if (playable && type === 'portal') ensure(o.target, '请设置传送目的地');
      if (playable && type === 'npc') ensure(o.dialogue, '人物需要对话');
      ids.set(oid, rawObj as WorldObject);
    }
  }
  ensure(ids.size <= WORLD_LIMITS.objects && tileCount <= WORLD_LIMITS.tiles, '作品总容量超出限制');
  const doc = value as AdventureDocument;
  for (const o of ids.values()) {
    if (playable && o.kind === 'checkpoint') {
      const room = doc.rooms.find((r) => r.objects.some((item) => item.id === o.id))!;
      location({ roomId: room.id, x: o.x, y: o.y }, doc.rooms, '检查点', true);
    }
    if (o.condition !== undefined) validateCondition(o.condition, ids, doc.flags);
    if (o.target !== undefined) location(o.target, doc.rooms, '传送目标房间', playable);
    if (o.dialogue !== undefined) {
      const pages = array(o.dialogue, 8, '对话') as DialoguePage[];
      ensure(pages.length > 0, '人物需要对话');
      const pageIds = new Set<string>();
      for (const page of pages) {
        const p = object(page, ['id', 'text', 'condition', 'choices'], '对话页');
        const pid = id(p.id, '对话页编号');
        ensure(!pageIds.has(pid), '对话页编号重复');
        pageIds.add(pid);
        text(p.text, 240, '对话', 1);
        if (p.condition !== undefined) validateCondition(p.condition, ids, doc.flags);
        array(p.choices, 3, '对话选项');
      }
      ensure(
        pages.some((p) => !p.condition),
        '人物需要一页默认对话',
      );
      for (const page of pages)
        for (const rawChoice of page.choices) {
          const c = object(
            rawChoice,
            ['label', 'next', 'setFlag', 'takeItem', 'giveItem', 'ending'],
            '对话选项',
          );
          text(c.label, 60, '选项文字', 1);
          if (c.next !== undefined)
            ensure(typeof c.next === 'string' && pageIds.has(c.next), '对话选项指向不存在的对话页');
          if (c.setFlag !== undefined)
            ensure(doc.flags.includes(c.setFlag as string), '对话使用不存在的故事标记');
          for (const k of ['takeItem', 'giveItem'])
            if (c[k] !== undefined)
              ensure(
                ['key', 'collectible'].includes(ids.get(c[k] as string)?.kind ?? ''),
                '对话使用不存在的物品',
              );
          if (c.ending !== undefined) text(c.ending, 240, '结局', 1);
        }
    }
  }
  if (doc.start !== null) location(doc.start, doc.rooms, '起点', playable);
  if (playable) {
    ensure(doc.start, '请放置起点');
    ensure(
      [...ids.values()].some((o) => o.kind === 'goal'),
      '请放置终点',
    );
  }
  ensure(assetReferences(doc).length <= WORLD_LIMITS.assets, '作品素材数量超出限制');
  return structuredClone(doc);
}
