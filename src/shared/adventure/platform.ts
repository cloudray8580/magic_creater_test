import {
  ensure,
  validateAdventure,
  type AdventureDocument,
  type Condition,
  type Location,
  type WorldObject,
} from './document.js';
export const PLAYER = {
  width: 0.62,
  height: 0.88,
  speed: 6,
  acceleration: 36,
  braking: 44,
  gravity: 26,
  jump: 13,
  spring: 17,
  step: 1 / 60,
  buffer: 0.12,
} as const;
export interface PlatformInput {
  move: number;
  jump: boolean;
  interact: boolean;
}
export interface PlatformSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  groundId: string | null;
  jumpCut: boolean;
  elapsed: number;
  coyote: number;
  jumpBuffer: number;
  facing: number;
  collected: string[];
  heldDoors: string[];
  switches: Record<string, number>;
  checkpointId: string | null;
  deaths: number;
  ending: string | null;
  reading: { title: string; text: string } | null;
  notice: string;
}
export interface PlatformSession {
  document: AdventureDocument;
  state: PlatformSnapshot;
  checkpoint: PlatformSnapshot;
  accumulator: number;
  previousInput: { jump: boolean; interact: boolean };
  jumpQueued: boolean;
  interactQueued: boolean;
  assist: boolean;
  preview: boolean;
  origin: Location;
}
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  id?: string;
  previousY?: number;
}
function overlap(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.width - 1e-7 &&
    a.x + a.width > b.x + 1e-7 &&
    a.y < b.y + b.height - 1e-7 &&
    a.y + a.height > b.y + 1e-7
  );
}
function body(s: PlatformSnapshot): Rect {
  return { x: s.x, y: s.y, width: PLAYER.width, height: PLAYER.height };
}
function objectRect(o: WorldObject, elapsed = 0): Rect {
  return { ...movingPosition(o, elapsed), width: o.width ?? 1, height: o.height ?? 1, id: o.id };
}
export function movingPosition(o: WorldObject, elapsed: number): { x: number; y: number } {
  if (!o.route) return { x: o.x, y: o.y };
  const dx = o.route.x - o.x,
    dy = o.route.y - o.y,
    distance = Math.hypot(dx, dy);
  if (!distance) return { x: o.x, y: o.y };
  const speed = o.speed === 'fast' ? 3 : o.speed === 'normal' ? 2 : 1;
  const progress = ((elapsed * speed) / distance) % 2,
    ratio = progress <= 1 ? progress : 2 - progress;
  return { x: o.x + dx * ratio, y: o.y + dy * ratio };
}
export function platformCondition(s: PlatformSession, condition?: Condition): boolean {
  if (!condition || condition.sources.length === 0) return true;
  const values = condition.sources.map(
    (id) =>
      s.state.collected.includes(id) ||
      s.state.switches[id] === -1 ||
      s.state.switches[id] > s.state.elapsed,
  );
  return condition.mode === 'all' ? values.every(Boolean) : values.some(Boolean);
}
export function platformDoorOpen(s: PlatformSession, door: WorldObject): boolean {
  return platformCondition(s, door.condition) || s.state.heldDoors.includes(door.id);
}
export function startPlatform(
  input: AdventureDocument,
  options: { assist?: boolean; from?: Location } = {},
): PlatformSession {
  const document = validateAdventure(input, true);
  ensure(document.gameType === 'platformer', '此运行器需要横版作品');
  if (options.from) validateAdventure({ ...document, start: options.from }, true);
  const origin = structuredClone(options.from ?? document.start!);
  const state: PlatformSnapshot = {
    x: origin.x + (1 - PLAYER.width) / 2,
    y: origin.y + 1 - PLAYER.height,
    vx: 0,
    vy: 0,
    onGround: false,
    groundId: null,
    jumpCut: false,
    elapsed: 0,
    coyote: 0,
    jumpBuffer: 0,
    facing: 1,
    collected: [],
    heldDoors: [],
    switches: {},
    checkpointId: null,
    deaths: 0,
    ending: null,
    reading: null,
    notice: '',
  };
  return {
    document,
    state,
    checkpoint: structuredClone(state),
    accumulator: 0,
    previousInput: { jump: false, interact: false },
    jumpQueued: false,
    interactQueued: false,
    assist: Boolean(options.assist),
    preview: Boolean(options.from),
    origin,
  };
}
export function clearPlatformInput(s: PlatformSession): PlatformSession {
  return {
    ...s,
    state: { ...s.state, jumpBuffer: 0 },
    jumpQueued: false,
    interactQueued: false,
    previousInput: { jump: false, interact: false },
    accumulator: 0,
  };
}
export function platformAction(
  s: PlatformSession,
  action: 'restart' | 'respawn' | 'close',
): PlatformSession {
  if (action === 'restart')
    return startPlatform(s.document, {
      assist: s.assist,
      ...(s.preview ? { from: s.origin } : {}),
    });
  if (action === 'close')
    return {
      ...s,
      state: { ...s.state, reading: null },
      previousInput: { jump: false, interact: false },
      accumulator: 0,
    };
  return {
    ...s,
    state: {
      ...structuredClone(s.checkpoint),
      vx: 0,
      vy: 0,
      deaths: s.state.deaths + 1,
      reading: null,
      notice: '没关系，再试一次。',
    },
    accumulator: 0,
    jumpQueued: false,
    interactQueued: false,
  };
}
function approach(value: number, target: number, step: number) {
  return value < target ? Math.min(value + step, target) : Math.max(value - step, target);
}
function solids(s: PlatformSession): Rect[] {
  const room = s.document.rooms[0];
  return [
    ...room.tiles
      .filter((t) => t.kind === 'solid')
      .map((t) => ({ x: t.x, y: t.y, width: 1, height: 1 })),
    ...room.objects
      .filter((o) => o.kind === 'door' && !platformDoorOpen(s, o))
      .map((o) => objectRect(o)),
  ];
}
function tick(s: PlatformSession, input: PlatformInput) {
  const p = s.state,
    room = s.document.rooms[0],
    dt = PLAYER.step;
  const oldTime = p.elapsed;
  p.elapsed += dt;
  p.heldDoors = room.objects
    .filter(
      (o) =>
        o.kind === 'door' && !platformCondition(s, o.condition) && overlap(body(p), objectRect(o)),
    )
    .map((o) => o.id);
  if (s.jumpQueued) p.jumpBuffer = s.assist ? 0.2 : PLAYER.buffer;
  else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  s.jumpQueued = false;
  if (p.onGround) p.coyote = s.assist ? 0.2 : PLAYER.buffer;
  else p.coyote = Math.max(0, p.coyote - dt);
  const direction = Math.sign(input.move);
  p.vx = approach(
    p.vx,
    direction * PLAYER.speed,
    (direction ? PLAYER.acceleration : PLAYER.braking) * dt,
  );
  if (direction) p.facing = direction;
  const ground = room.objects.find((o) => o.id === p.groundId && o.kind === 'mover');
  const carry = ground ? movingPosition(ground, p.elapsed) : null,
    previous = ground ? movingPosition(ground, oldTime) : null;
  const dx = carry && previous ? carry.x - previous.x : 0,
    dy = carry && previous ? carry.y - previous.y : 0;
  if (p.jumpBuffer > 0 && p.coyote > 0) {
    p.vy = -PLAYER.jump;
    p.jumpCut = true;
    p.onGround = false;
    p.groundId = null;
    p.coyote = 0;
    p.jumpBuffer = 0;
  } else if (p.jumpCut && !input.jump) {
    p.vy = Math.max(p.vy, -6);
    p.jumpCut = false;
  }
  p.vy = Math.min(p.vy + PLAYER.gravity * dt, 20);
  const blocks = solids(s);
  p.x += p.vx * dt + dx;
  for (const r of blocks)
    if (overlap(body(p), r)) {
      if (p.vx + dx / dt > 0) p.x = r.x - PLAYER.width;
      else if (p.vx + dx / dt < 0) p.x = r.x + r.width;
      p.vx = 0;
    }
  p.x = Math.max(0, Math.min(room.width - PLAYER.width, p.x));
  const oldY = p.y,
    oldBottom = oldY + PLAYER.height;
  p.y += p.vy * dt + (ground && p.vy >= 0 ? dy : 0);
  p.onGround = false;
  p.groundId = null;
  const platforms: Rect[] = [
    ...blocks,
    ...room.tiles
      .filter((t) => t.kind === 'oneway')
      .map((t) => ({ x: t.x, y: t.y, width: 1, height: 0.2 })),
    ...room.objects
      .filter((o) => o.kind === 'mover')
      .map((o) => ({
        ...objectRect(o, p.elapsed),
        previousY: movingPosition(o, oldTime).y,
        height: 0.25,
      })),
  ];
  {
    const crossed = platforms
      .filter(
        (r) =>
          (p.vy >= 0 || r.previousY !== undefined) &&
          p.x < r.x + r.width - 1e-7 &&
          p.x + PLAYER.width > r.x + 1e-7 &&
          oldBottom <= (r.previousY ?? r.y) + 0.01 &&
          p.y + PLAYER.height >= r.y,
      )
      .sort((a, b) => a.y - b.y);
    if (crossed.length) {
      p.y = crossed[0].y - PLAYER.height;
      p.vy = 0;
      p.onGround = true;
      p.groundId = crossed[0].id ?? null;
    }
  }
  if (p.y < oldY) {
    if (p.onGround && blocks.some((r) => overlap(body(p), r))) {
      Object.assign(s, platformAction(s, 'respawn'));
      return;
    }
    const ceilings = blocks
      .filter(
        (r) =>
          p.x < r.x + r.width &&
          p.x + PLAYER.width > r.x &&
          oldY >= r.y + r.height - 0.01 &&
          p.y <= r.y + r.height,
      )
      .sort((a, b) => b.y + b.height - a.y - a.height);
    if (ceilings.length) {
      p.y = ceilings[0].y + ceilings[0].height;
      p.vy = 0;
    }
  }
  if (s.interactQueued) {
    s.interactQueued = false;
    const near = room.objects
      .filter(
        (o) =>
          ['switch', 'sign'].includes(o.kind) &&
          Math.hypot(o.x + 0.5 - (p.x + PLAYER.width / 2), o.y + 0.5 - (p.y + PLAYER.height / 2)) <
            1.8,
      )
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
    const o = near[0];
    if (o?.kind === 'switch') {
      const on = p.switches[o.id] === -1 || p.switches[o.id] > p.elapsed;
      p.switches[o.id] = on ? 0 : o.seconds ? p.elapsed + o.seconds : -1;
      p.notice = on ? '开关关上了。' : '开关亮起来了！';
    } else if (o) p.reading = { title: o.name || '路牌', text: o.text || '前方有新的风景。' };
  }
  let died =
    p.y > room.height + 2 ||
    room.objects.some(
      (o) => ['hazard', 'patrol'].includes(o.kind) && overlap(body(p), objectRect(o, p.elapsed)),
    );
  for (const t of room.tiles)
    if (t.kind === 'water' && overlap(body(p), { ...t, width: 1, height: 1 })) died = true;
  for (const o of room.objects) {
    const hit = overlap(body(p), objectRect(o, p.elapsed));
    if (!hit) continue;
    if (o.kind === 'hazard' || o.kind === 'patrol') died = true;
    if ((o.kind === 'collectible' || o.kind === 'key') && !p.collected.includes(o.id)) {
      p.collected.push(o.id);
      p.notice = '找到：' + (o.name || '一枚小小的惊喜');
    }
    if (o.kind === 'checkpoint' && !died && p.checkpointId !== o.id) {
      p.checkpointId = o.id;
      p.notice = '检查点已点亮';
      s.checkpoint = {
        ...structuredClone(p),
        vx: 0,
        vy: 0,
        onGround: false,
        groundId: null,
        jumpCut: false,
        coyote: 0,
        jumpBuffer: 0,
      };
    }
    if (
      o.kind === 'spring' &&
      p.vy >= 0 &&
      oldBottom <= o.y + 0.75 &&
      p.y + PLAYER.height >= o.y + 0.75
    ) {
      p.y = o.y + 0.75 - PLAYER.height;
      p.vy = -PLAYER.spring;
      p.jumpCut = false;
      p.onGround = false;
      p.groundId = null;
      p.coyote = 0;
      // Spring momentum is automatic; releasing jump must not cancel it.
      p.jumpBuffer = 0;
    }
    if (o.kind === 'goal' && !died) {
      const ready = room.objects
        .filter((o) => o.kind === 'collectible' && o.required)
        .every((o) => p.collected.includes(o.id));
      if (ready && platformCondition(s, o.condition))
        p.ending = o.ending || '你完成了这段小小的冒险！';
      else p.notice = '再找找必需的物品或机关吧。';
    }
  }
  if (died) {
    const restored = platformAction(s, 'respawn');
    Object.assign(s, restored);
  }
}
export function stepPlatform(
  session: PlatformSession,
  input: PlatformInput,
  deltaSeconds: number,
): PlatformSession {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || !Number.isFinite(input.move))
    return session;
  if (session.state.ending || session.state.reading) return session;
  const s: PlatformSession = {
    ...session,
    state: structuredClone(session.state),
    previousInput: { jump: input.jump, interact: input.interact },
  };
  if (input.jump && !session.previousInput.jump) s.jumpQueued = true;
  if (input.interact && !session.previousInput.interact) s.interactQueued = true;
  s.accumulator += Math.min(deltaSeconds, 0.25);
  while (s.accumulator + 1e-9 >= PLAYER.step) {
    s.accumulator = Math.max(0, s.accumulator - PLAYER.step);
    tick(s, input);
    if (s.state.ending || s.state.reading) {
      s.accumulator = 0;
      break;
    }
  }
  return s;
}
