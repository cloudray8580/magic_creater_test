import { roomIndex } from './spatial.js';
import {
  ensure,
  validateAdventure,
  type AdventureDocument,
  type Condition,
  type Room,
  type WorldObject,
} from './document.js';
export interface StorySnapshot {
  roomId: string;
  x: number;
  y: number;
  facing: { x: number; y: number };
  inventory: string[];
  collected: string[];
  flags: string[];
  switches: Record<string, boolean>;
  boxes: Record<string, { x: number; y: number }>;
  usedChoices: string[];
  dialogue: { objectId: string; pageId: string } | null;
  ending: string | null;
  portalLock: string | null;
  steps: number;
  notice: string;
}
interface StoryCheckpoint {
  state: StorySnapshot;
  entry: StorySnapshot;
}
export interface StorySession {
  document: AdventureDocument;
  state: StorySnapshot;
  entry: StorySnapshot;
  history: StoryCheckpoint[];
}
export type StoryAction =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'interact'; id?: string }
  | { type: 'choose'; index: number }
  | { type: 'close' | 'undo' | 'reset-room' | 'restart' };
function objects(doc: AdventureDocument) {
  return doc.rooms.flatMap((r) => r.objects);
}
function roomFor(doc: AdventureDocument, state: StorySnapshot) {
  return doc.rooms.find((r) => r.id === state.roomId)!;
}
function occupies(o: WorldObject, x: number, y: number) {
  return x >= o.x && x < o.x + (o.width ?? 1) && y >= o.y && y < o.y + (o.height ?? 1);
}
export function platePressed(
  doc: AdventureDocument,
  state: StorySnapshot,
  plate: WorldObject,
): boolean {
  const room = doc.rooms.find((r) => r.objects.some((o) => o.id === plate.id));
  return Boolean(
    room &&
    ((state.roomId === room.id && state.x === plate.x && state.y === plate.y) ||
      room.objects.some(
        (o) =>
          o.kind === 'box' && state.boxes[o.id]?.x === plate.x && state.boxes[o.id]?.y === plate.y,
      )),
  );
}
export function conditionMet(
  doc: AdventureDocument,
  state: StorySnapshot,
  condition?: Condition,
): boolean {
  if (!condition || !condition.sources.length) return true;
  const available = objects(doc);
  const values = condition.sources.map((source) => {
    if (source.startsWith('flag:')) return state.flags.includes(source.slice(5));
    const o = available.find((item) => item.id === source);
    if (o?.kind === 'plate') return platePressed(doc, state, o);
    if (o?.kind === 'switch')
      return Object.hasOwn(state.switches, source) && state.switches[source];
    return state.inventory.includes(source);
  });
  return condition.mode === 'all' ? values.every(Boolean) : values.some(Boolean);
}
function blocked(
  doc: AdventureDocument,
  state: StorySnapshot,
  room: Room,
  x: number,
  y: number,
  skipBox?: string,
): boolean {
  const terrain = roomIndex(room).at(x, y)?.kind;
  if (
    x < 0 ||
    y < 0 ||
    x >= room.width ||
    y >= room.height ||
    terrain === 'solid' ||
    terrain === 'water'
  )
    return true;
  return room.objects.some((o) => {
    if (o.kind === 'box')
      return o.id !== skipBox && state.boxes[o.id]?.x === x && state.boxes[o.id]?.y === y;
    if (!occupies(o, x, y)) return false;
    return o.kind === 'npc' || (o.kind === 'door' && !conditionMet(doc, state, o.condition));
  });
}
function arrive(doc: AdventureDocument, state: StorySnapshot) {
  const room = roomFor(doc, state);
  for (const o of room.objects)
    if (o.x === state.x && o.y === state.y) {
      if ((o.kind === 'collectible' || o.kind === 'key') && !state.collected.includes(o.id)) {
        state.collected.push(o.id);
        state.inventory.push(o.id);
        state.notice = '找到：' + (o.name ?? (o.kind === 'key' ? '钥匙' : '礼物'));
      }
      if (o.kind === 'goal') {
        const ready = objects(doc)
          .filter((item) => item.kind === 'collectible' && item.required)
          .every((item) => state.collected.includes(item.id));
        if (ready && conditionMet(doc, state, o.condition))
          state.ending = o.ending || '这个小世界，因为你变得不同了。';
        else {
          const missing = objects(doc).filter(
            (item) =>
              item.kind === 'collectible' && item.required && !state.collected.includes(item.id),
          );
          const conditions = (o.condition?.sources ?? [])
            .filter((id) => !conditionMet(doc, state, { mode: 'all', sources: [id] }))
            .map((id) =>
              id.startsWith('flag:')
                ? id.slice(5)
                : objects(doc).find((item) => item.id === id)?.name || '机关或物品',
            );
          state.notice = [
            missing.length
              ? `还需收集 ${missing.length} 件必需物品：${missing.map((item) => item.name || '礼物').join('、')}`
              : '',
            !conditionMet(doc, state, o.condition)
              ? `还需完成${o.condition?.mode === 'any' ? '其中一项' : ''}：${conditions.join('、')}`
              : '',
          ]
            .filter(Boolean)
            .join('；');
        }
      }
    }
}
export function startStory(input: AdventureDocument): StorySession {
  const document = validateAdventure(input, true);
  ensure(document.gameType === 'story', '此运行器需要探索故事作品');
  const state: StorySnapshot = {
    ...document.start!,
    facing: { x: 1, y: 0 },
    inventory: [],
    collected: [],
    flags: [],
    switches: {},
    boxes: Object.fromEntries(
      objects(document)
        .filter((o) => o.kind === 'box')
        .map((o) => [o.id, { x: o.x, y: o.y }]),
    ),
    usedChoices: [],
    dialogue: null,
    ending: null,
    portalLock: null,
    steps: 0,
    notice: '',
  };
  arrive(document, state);
  return { document, state, entry: structuredClone(state), history: [] };
}
function commit(s: StorySession, state: StorySnapshot, entry = s.entry): StorySession {
  return {
    ...s,
    state,
    entry,
    history: [...s.history, { state: s.state, entry: s.entry }].slice(-100),
  };
}
function notify(s: StorySession, notice: string): StorySession {
  return { ...s, state: { ...s.state, notice } };
}
export function nearbyInteractions(session: StorySession): WorldObject[] {
  const { state, document } = session;
  return roomFor(document, state)
    .objects.filter(
      (o) =>
        ['npc', 'sign', 'switch'].includes(o.kind) &&
        Math.abs(o.x - state.x) + Math.abs(o.y - state.y) <= 1,
    )
    .sort((a, b) => {
      const front = (o: WorldObject) =>
        o.x === state.x + state.facing.x && o.y === state.y + state.facing.y ? 1 : 0;
      return front(b) - front(a);
    });
}
export function storyDialogue(s: StorySession) {
  if (!s.state.dialogue) return null;
  const o = objects(s.document).find((o) => o.id === s.state.dialogue!.objectId);
  if (!o) return null;
  if (o.kind === 'sign')
    return { title: o.name || '路牌', text: o.text || '在这里写下你的提示。', choices: [] };
  const page = o.dialogue?.find((p) => p.id === s.state.dialogue!.pageId);
  return page ? { title: o.name || '朋友', text: page.text, choices: page.choices } : null;
}
export function storyAction(session: StorySession, action: StoryAction): StorySession {
  if (action.type === 'restart') return startStory(session.document);
  if (action.type === 'undo') {
    const previous = session.history.at(-1);
    return previous
      ? {
          ...session,
          state: previous.state,
          entry: previous.entry,
          history: session.history.slice(0, -1),
        }
      : session;
  }
  if (action.type === 'reset-room') return commit(session, structuredClone(session.entry));
  if (session.state.ending) return session;
  const doc = session.document,
    state = structuredClone(session.state),
    room = roomFor(doc, state);
  state.notice = '';
  if (action.type === 'close') {
    if (!state.dialogue) return session;
    state.dialogue = null;
    return commit(session, state);
  }
  if (action.type === 'choose') {
    if (!state.dialogue || !Number.isInteger(action.index)) return session;
    const o = room.objects.find((o) => o.id === state.dialogue!.objectId);
    const page = o?.dialogue?.find((p) => p.id === state.dialogue!.pageId);
    const choice = page?.choices[action.index];
    if (!choice) return session;
    if (choice.takeItem && !state.inventory.includes(choice.takeItem))
      return notify(session, '背包里还没有需要交出的物品。');
    const choiceId = o!.id + '/' + page!.id + '/' + action.index;
    if (choice.giveItem && state.collected.includes(choice.giveItem))
      return notify(session, '这份礼物已经收到了。');
    if (choice.takeItem) state.inventory = state.inventory.filter((id) => id !== choice.takeItem);
    if (choice.giveItem) {
      if (!state.inventory.includes(choice.giveItem)) state.inventory.push(choice.giveItem);
      if (!state.collected.includes(choice.giveItem)) state.collected.push(choice.giveItem);
      state.usedChoices.push(choiceId);
    }
    if (choice.setFlag && !state.flags.includes(choice.setFlag)) state.flags.push(choice.setFlag);
    if (choice.ending) state.ending = choice.ending;
    state.dialogue = choice.next ? { objectId: o!.id, pageId: choice.next } : null;
    return commit(session, state);
  }
  if (state.dialogue) return session;
  if (action.type === 'interact') {
    const candidates = nearbyInteractions(session);
    const o = action.id ? candidates.find((o) => o.id === action.id) : candidates[0];
    if (!o) return notify(session, '靠近人物、路牌或开关，按 E 互动。');
    if (o.kind === 'switch') {
      state.switches[o.id] = !state.switches[o.id];
      state.notice = state.switches[o.id] ? '开关亮起来了。' : '开关关闭了。';
    } else if (o.kind === 'sign') state.dialogue = { objectId: o.id, pageId: 'sign' };
    else {
      const page = o.dialogue?.find((p) => conditionMet(doc, state, p.condition));
      if (!page) return notify(session, '这位朋友还没有准备好对话。');
      state.dialogue = { objectId: o.id, pageId: page.id };
    }
    return commit(session, state);
  }
  if (action.type === 'move') {
    if (
      !Number.isInteger(action.dx) ||
      !Number.isInteger(action.dy) ||
      Math.abs(action.dx) + Math.abs(action.dy) !== 1
    )
      return session;
    state.facing = { x: action.dx, y: action.dy };
    const x = state.x + action.dx,
      y = state.y + action.dy;
    const box = room.objects.find(
      (o) => o.kind === 'box' && state.boxes[o.id]?.x === x && state.boxes[o.id]?.y === y,
    );
    if (box) {
      if (blocked(doc, state, room, x + action.dx, y + action.dy))
        return {
          ...session,
          state: { ...session.state, facing: state.facing, notice: '箱子前面需要留出一格空位。' },
        };
      state.boxes[box.id] = { x: x + action.dx, y: y + action.dy };
    }
    if (blocked(doc, state, room, x, y, box?.id))
      return {
        ...session,
        state: {
          ...session.state,
          facing: state.facing,
          notice: '这条路暂时走不通，试试别的方向。',
        },
      };
    state.x = x;
    state.y = y;
    state.steps++;
    const portal = room.objects.find((o) => o.kind === 'portal' && o.x === x && o.y === y);
    if (!portal) state.portalLock = null;
    if (portal?.target && portal.id !== state.portalLock) {
      const targetRoom = doc.rooms.find((r) => r.id === portal.target!.roomId)!;
      if (blocked(doc, state, targetRoom, portal.target.x, portal.target.y))
        return notify(session, '传送目的地被挡住了。');
      Object.assign(state, portal.target);
      state.portalLock =
        targetRoom.objects.find((o) => o.kind === 'portal' && o.x === state.x && o.y === state.y)
          ?.id ?? null;
      arrive(doc, state);
      return commit(
        session,
        state,
        targetRoom.id === room.id ? session.entry : structuredClone(state),
      );
    }
    arrive(doc, state);
    return commit(session, state);
  }
  return session;
}
