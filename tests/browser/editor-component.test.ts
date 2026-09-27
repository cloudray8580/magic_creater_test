import { afterEach, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AdventureEditor } from '../../src/client/AdventureEditor.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { createHistory, changeHistory, undoHistory, redoHistory } from '../../src/shared/game.js';
let root: Root, host: HTMLDivElement;
let latest = adventureTemplate();
const preview = vi.fn();
function Harness() {
  const [h, set] = useState(() => createHistory(adventureTemplate()));
  latest = h.present;
  return createElement(AdventureEditor, {
    document: h.present,
    onChange: (doc) => set(changeHistory(h, doc)),
    onUndo: () => set(undoHistory(h)),
    onRedo: () => set(redoHistory(h)),
    canUndo: Boolean(h.past.length),
    canRedo: Boolean(h.future.length),
    onPreviewFrom: preview,
  });
}
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  preview.mockClear();
});
async function start() {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(Harness)));
  const canvas = host.querySelector('svg')!;
  vi.spyOn(canvas, 'setPointerCapture').mockImplementation(() => {});
  vi.spyOn(canvas, 'hasPointerCapture').mockReturnValue(false);
  return canvas;
}
async function click(name: string) {
  const button = Array.from(host.querySelectorAll('button')).find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent) === name,
  )!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
}
async function pointer(canvas: SVGSVGElement, type: string, x: number, y: number) {
  const b = canvas.getBoundingClientRect();
  await act(async () =>
    canvas.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        button: 0,
        clientX: b.left + ((x + 0.5) / latest.rooms[0].width) * b.width,
        clientY: b.top + ((y + 0.5) / latest.rooms[0].height) * b.height,
      }),
    ),
  );
}
it('commits a drag as one undo transaction and cancels interrupted strokes', async () => {
  const canvas = await start();
  const original = structuredClone(latest);
  await click('地面');
  await pointer(canvas, 'pointerdown', 0, 3);
  await pointer(canvas, 'pointermove', 4, 3);
  expect(latest).toEqual(original); // Transient drawing never enters IndexedDB/history yet.
  await pointer(canvas, 'pointerup', 4, 3);
  expect(latest.rooms[0].tiles.filter((t) => t.y === 3)).toHaveLength(5);
  await click('撤销');
  expect(latest).toEqual(original);
  await click('重做');
  expect(latest.rooms[0].tiles.filter((t) => t.y === 3)).toHaveLength(5);
  const saved = structuredClone(latest);
  await pointer(canvas, 'pointerdown', 5, 3);
  await pointer(canvas, 'pointercancel', 5, 3);
  expect(latest).toEqual(saved);
  await click('橡皮擦');
  await pointer(canvas, 'pointerdown', 2, 3);
  await pointer(canvas, 'pointerup', 2, 3);
  expect(latest.rooms[0].tiles.filter((t) => t.y === 3)).toHaveLength(4);
});
it('selects, copies, moves and safely deletes linked entities, then previews the selected location', async () => {
  const canvas = await start();
  await pointer(canvas, 'pointerdown', 30, 12);
  await pointer(canvas, 'pointerup', 30, 12);
  expect(host.textContent).toContain('门的设置');
  await click('复制物体');
  expect(latest.rooms[0].objects.filter((o) => o.kind === 'door')).toHaveLength(2);
  await click('删除物体');
  expect(latest.rooms[0].objects.filter((o) => o.kind === 'door')).toHaveLength(1);
  await pointer(canvas, 'pointerdown', 24, 13);
  await pointer(canvas, 'pointerup', 24, 13);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  await click('删除物体');
  expect(latest.rooms[0].objects.some((o) => o.id === 'lantern-switch')).toBe(true);
  vi.mocked(window.confirm).mockReturnValue(true);
  await click('删除物体');
  expect(latest.rooms[0].objects.find((o) => o.id === 'gate')!.condition?.sources).toEqual([]);
  await pointer(canvas, 'pointerdown', 30, 12);
  await pointer(canvas, 'pointerup', 32, 12);
  expect(latest.rooms[0].objects.find((o) => o.id === 'gate')!.x).toBe(32);
  await click('从格 30,12 试玩');
  expect(preview).toHaveBeenCalledWith({ roomId: 'trail', x: 30, y: 12 });
});

async function field(name: string, value: string) {
  const label = Array.from(host.querySelectorAll('label')).find(
    (l) => l.firstChild?.textContent === name,
  )!;
  expect(label).toBeTruthy();
  const input = label.querySelector('input,select,textarea')! as
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  await act(async () => input.focus());
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!.call(input, value);
    input.dispatchEvent(
      new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
    );
  });
  await act(async () => input.blur());
}
it('edits visible connections and object settings without requiring identifiers', async () => {
  const canvas = await start();
  await pointer(canvas, 'pointerdown', 30, 13);
  await pointer(canvas, 'pointerup', 30, 13);
  await field('条件关系', 'any');
  expect(latest.rooms[0].objects.find((o) => o.id === 'gate')!.condition!.mode).toBe('any');
  await click('在地图上连接机关');
  await pointer(canvas, 'pointerdown', 0, 3);
  await pointer(canvas, 'pointerup', 0, 3);
  expect(host.textContent).toContain('请点击开关、压力板或收集物');
  await pointer(canvas, 'pointerdown', 24, 13);
  await pointer(canvas, 'pointerup', 24, 13);
  expect(latest.rooms[0].objects.find((o) => o.id === 'gate')!.condition!.sources).toEqual([]);
  await click('在地图上连接机关');
  await pointer(canvas, 'pointerdown', 24, 13);
  await pointer(canvas, 'pointerup', 24, 13);
  expect(latest.rooms[0].objects.find((o) => o.id === 'gate')!.condition!.sources).toEqual([
    'lantern-switch',
  ]);
  await field('物体名称', '我的秘密门');
  await field('横坐标', '31');
  await field('纵坐标', '11');
  await field('宽度（格）', '2');
  await field('高度（格）', '3');
  expect(latest.rooms[0].objects.find((o) => o.id === 'gate')).toMatchObject({
    name: '我的秘密门',
    x: 31,
    y: 11,
    width: 2,
    height: 3,
  });
  await click('选择 / 移动');
  await pointer(canvas, 'pointerdown', 24, 13);
  await pointer(canvas, 'pointerup', 24, 13);
  await field('自动关闭秒数（0 为保持）', '8');
  expect(latest.rooms[0].objects.find((o) => o.id === 'lantern-switch')!.seconds).toBe(8);
});
it('sets movement routes, required collectibles and narrative text', async () => {
  const canvas = await start();
  await click('移动平台');
  await pointer(canvas, 'pointerdown', 2, 3);
  await pointer(canvas, 'pointerup', 2, 3);
  await click('选择 / 移动');
  await pointer(canvas, 'pointerdown', 2, 3);
  await pointer(canvas, 'pointerup', 2, 3);
  await field('速度', 'fast');
  await click('在地图上设置路线终点');
  await pointer(canvas, 'pointerdown', 8, 5);
  await pointer(canvas, 'pointerup', 8, 5);
  expect(latest.rooms[0].objects.find((o) => o.kind === 'mover')).toMatchObject({
    speed: 'fast',
    route: { x: 8, y: 5 },
  });
  await click('星星');
  await pointer(canvas, 'pointerdown', 2, 5);
  await pointer(canvas, 'pointerup', 2, 5);
  await click('选择 / 移动');
  await pointer(canvas, 'pointerdown', 2, 5);
  await pointer(canvas, 'pointerup', 2, 5);
  await act(async () => (host.querySelector('.inline-check input') as HTMLInputElement).click());
  expect(latest.rooms[0].objects.find((o) => o.kind === 'collectible' && o.x === 2)!.required).toBe(
    true,
  );
  await click('路牌');
  await pointer(canvas, 'pointerdown', 3, 5);
  await pointer(canvas, 'pointerup', 3, 5);
  await click('选择 / 移动');
  await pointer(canvas, 'pointerdown', 3, 5);
  await pointer(canvas, 'pointerup', 3, 5);
  await field('路牌文字', '抬头看看');
  expect(
    latest.rooms[0].objects.find((o) => o.kind === 'sign' && o.x === 3 && o.y === 5)!.text,
  ).toBe('抬头看看');
  await pointer(canvas, 'pointerdown', 39, 13);
  await pointer(canvas, 'pointerup', 39, 13);
  await field('结束时的话', '明天再来');
  expect(latest.rooms[0].objects.find((o) => o.kind === 'goal')!.ending).toBe('明天再来');
});
it('changes atmosphere and map size with undo, while invalid edits leave the world intact', async () => {
  const canvas = await start();
  await field('作品名称', '夜间邮差');
  await field('作品简介', '月亮来信');
  await field('世界氛围', 'dusk');
  await field('背景音乐', 'night');
  await field('主角', 'robot');
  await field('地图宽度', '50');
  await field('地图高度', '20');
  expect(latest).toMatchObject({
    title: '夜间邮差',
    description: '月亮来信',
    theme: 'dusk',
    music: 'night',
    hero: { skin: 'robot' },
  });
  expect(latest.rooms[0]).toMatchObject({ width: 50, height: 20 });
  const before = structuredClone(latest);
  await field('地图宽度', '4');
  expect(latest).toEqual(before);
  expect(host.querySelector('[role="status"]')!.textContent).toMatch(/范围|超出/);
  await act(async () =>
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })),
  );
  expect(latest.rooms[0].height).toBe(16);
  await act(async () =>
    canvas.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }),
    ),
  );
  expect(latest.rooms[0].height).toBe(20);
  await click('放大地图');
  await click('缩小地图');
  await click('适合窗口');
});

it('rejects an out-of-map drag instead of silently clamping the object to an edge', async () => {
  const canvas = await start();
  const before = structuredClone(latest);
  await pointer(canvas, 'pointerdown', 24, 13);
  await pointer(canvas, 'pointerup', 45, 13);
  expect(latest).toEqual(before);
  expect(host.querySelector('[role="status"]')!.textContent).toMatch(/范围|超出/);
});

it('keeps the clicked preview cell while the pointer travels away to the preview button', async () => {
  const canvas = await start();
  await pointer(canvas, 'pointerdown', 2, 13);
  await pointer(canvas, 'pointerup', 2, 13);
  await pointer(canvas, 'pointermove', 0, 15);
  await click('从格 2,13 试玩');
  expect(preview).toHaveBeenCalledWith({ roomId: 'trail', x: 2, y: 13 });
});

it('allows typing map dimensions digit by digit before committing on blur', async () => {
  await start();
  const input = Array.from(host.querySelectorAll('label'))
    .find((l) => l.firstChild?.textContent === '地图宽度')!
    .querySelector('input')!;
  await act(async () => input.focus());
  const set = async (value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await set('5');
  expect(input.value).toBe('5');
  expect(latest.rooms[0].width).toBe(42);
  await set('50');
  expect(latest.rooms[0].width).toBe(42);
  await act(async () => input.blur());
  expect(latest.rooms[0].width).toBe(50);
});

it('preserves a pending dimension edit when focusing the map starts a paint stroke', async () => {
  const canvas = await start();
  await click('地面');
  const input = Array.from(host.querySelectorAll('label'))
    .find((l) => l.firstChild?.textContent === '地图宽度')!
    .querySelector('input')!;
  await act(async () => input.focus());
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '50');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await pointer(canvas, 'pointerdown', 0, 3);
  await pointer(canvas, 'pointerup', 0, 3);
  expect(latest.rooms[0].width).toBe(50);
  expect(latest.rooms[0].tiles.some((t) => t.x === 0 && t.y === 3)).toBe(true);
});

it('selects and drags an object at the new position after committing its focused coordinate', async () => {
  const canvas = await start();
  await pointer(canvas, 'pointerdown', 24, 13);
  await pointer(canvas, 'pointerup', 24, 13);
  const moved = latest.rooms[0].objects.find((o) => o.x === 24 && o.y === 13)!;
  const input = Array.from(host.querySelectorAll('label'))
    .find((l) => l.firstChild?.textContent === '横坐标')!
    .querySelector('input')!;
  await act(async () => input.focus());
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '25');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await pointer(canvas, 'pointerdown', 25, 13);
  await pointer(canvas, 'pointerup', 26, 13);
  expect(latest.rooms[0].objects.find((o) => o.id === moved.id)!.x).toBe(26);
});
