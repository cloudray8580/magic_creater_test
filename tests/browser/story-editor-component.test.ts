import { afterEach, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AdventureEditor } from '../../src/client/AdventureEditor.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { createHistory, changeHistory, undoHistory, redoHistory } from '../../src/shared/game.js';
let root: Root,
  host: HTMLDivElement,
  latest = adventureTemplate('forest-letter');
function Harness() {
  const [history, set] = useState(() => createHistory(adventureTemplate('forest-letter')));
  latest = history.present;
  return createElement(AdventureEditor, {
    document: history.present,
    onChange: (doc) => set(changeHistory(history, doc)),
    onUndo: () => set(undoHistory(history)),
    onRedo: () => set(redoHistory(history)),
    canUndo: Boolean(history.past.length),
    canRedo: Boolean(history.future.length),
    onPreviewFrom: vi.fn(),
  });
}
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
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
async function click(name: string, scope: ParentNode = host) {
  const button = Array.from(scope.querySelectorAll('button')).find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent) === name,
  )!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
}
async function field(name: string, value: string, scope: ParentNode = host) {
  const label = Array.from(scope.querySelectorAll('label')).find(
    (l) => l.firstChild?.textContent === name,
  )!;
  expect(label).toBeTruthy();
  const input = label.querySelector('input,select,textarea') as
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
async function cell(canvas: SVGSVGElement, x: number, y: number) {
  const b = canvas.getBoundingClientRect();
  const dimensions = canvas.viewBox.baseVal;
  const args = {
    bubbles: true,
    pointerId: 1,
    button: 0,
    clientX: b.left + (((x + 0.5) * 40) / dimensions.width) * b.width,
    clientY: b.top + (((y + 0.5) * 40) / dimensions.height) * b.height,
  };
  await act(async () => canvas.dispatchEvent(new PointerEvent('pointerdown', args)));
  await act(async () => canvas.dispatchEvent(new PointerEvent('pointerup', args)));
}
const all = () => latest.rooms.flatMap((r) => r.objects);
it('creates rooms, chooses a portal destination on the map, cancels and undoes room deletion', async () => {
  const canvas = await start();
  await click('添加房间');
  const roomId = latest.rooms.at(-1)!.id;
  await field('房间名称', '月亮阁楼');
  await field('地板', 'wood');
  expect(latest.rooms.at(-1)).toMatchObject({ name: '月亮阁楼', ground: 'wood' });
  await click('林间花园');
  await cell(canvas, 13, 7);
  await field('目的房间', roomId);
  await click('在目的房间选落点');
  expect(host.textContent).toContain('在这个房间点击门的落点');
  await cell(canvas, 2, 2);
  expect(all().find((o) => o.id === 'forest-door')!.target).toEqual({ roomId, x: 2, y: 2 });
  expect(host.textContent).toContain('当前落点：月亮阁楼 (2,2)');
  await click('在目的房间选落点');
  await click('取消选落点');
  expect(all().find((o) => o.id === 'forest-door')!.target).toEqual({ roomId, x: 2, y: 2 });
  await click('查看世界设置');
  await click('月亮阁楼');
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  await click('删除房间');
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('起点'));
  expect(latest.rooms).toHaveLength(3);
  vi.mocked(window.confirm).mockReturnValue(true);
  await click('删除房间');
  expect(latest.rooms).toHaveLength(2);
  expect(all().find((o) => o.id === 'forest-door')!.target).toBeUndefined();
  await click('撤销');
  expect(latest.rooms).toHaveLength(3);
  expect(all().find((o) => o.id === 'forest-door')!.target?.roomId).toBe(roomId);
});
it('connects shared story events and renames their conditions without exposing internal identifiers', async () => {
  const canvas = await start();
  await cell(canvas, 9, 7);
  await field('添加条件', 'flag:delivered');
  await field('条件关系', 'any');
  expect(all().find((o) => o.id === 'door')!.condition).toEqual({
    mode: 'any',
    sources: ['plate', 'flag:delivered'],
  });
  await click('查看世界设置');
  await field('事件名称', '已送信');
  expect(latest.flags).toEqual(['已送信']);
  expect(all().find((o) => o.id === 'door')!.condition!.sources).toContain('flag:已送信');
  await field('添加一件事', '点亮星星');
  await click('记下这件事');
  expect(latest.flags).toEqual(['已送信', '点亮星星']);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  await click('删除事件 已送信');
  expect(latest.flags).toHaveLength(2);
  vi.mocked(window.confirm).mockReturnValue(true);
  await click('删除事件 已送信');
  expect(latest.flags).toEqual(['点亮星星']);
  expect(JSON.stringify(latest)).not.toContain('flag:已送信');
});
it('edits dialogue situations and composable choices, with guarded page references', async () => {
  const canvas = await start();
  await click('狐狸的树屋');
  await cell(canvas, 8, 5);
  await field('物体外形', 'robot');
  await click('添加对话页');
  let pages = all().find((o) => o.id === 'friend')!.dialogue!;
  const addedId = pages.at(-1)!.id;
  let cards = host.querySelectorAll('.dialogue-page');
  const last = cards[cards.length - 1] as HTMLDetailsElement;
  last.open = true;
  await field('人物说的话', '一起看看星空吧。', last);
  await act(async () => (last.querySelector('input[type=checkbox]') as HTMLInputElement).click());
  await field('添加条件', 'flag:delivered', last);
  await click('上移', last);
  pages = all().find((o) => o.id === 'friend')!.dialogue!;
  expect(pages.at(-2)!.id).toBe(addedId);
  cards = host.querySelectorAll('.dialogue-page');
  const first = cards[0];
  await click('添加玩家选项', first);
  await field('选项文字', '送来一颗星星', first);
  await field('接着说', addedId, first);
  await field('交出物品', 'gift', first);
  await field('获得物品', 'gift', first);
  await field('获得物品', '', first);
  await field('记住发生的事', 'delivered', first);
  await field('出现结局（留空继续探索）', '今晚的星星属于你。', first);
  const choice = all().find((o) => o.id === 'friend')!.dialogue![0].choices[0];
  expect(choice).toMatchObject({
    label: '送来一颗星星',
    next: addedId,
    takeItem: 'gift',
    giveItem: undefined,
    setFlag: 'delivered',
    ending: '今晚的星星属于你。',
  });
  const linkedCard = Array.from(host.querySelectorAll('.dialogue-page')).find((c) =>
    c.querySelector('summary')!.textContent!.includes('一起看看星空吧。'),
  )!;
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  await click('删除对话页', linkedCard);
  expect(all().find((o) => o.id === 'friend')!.dialogue).toHaveLength(4);
  vi.mocked(window.confirm).mockReturnValue(true);
  await click('删除对话页', linkedCard);
  expect(all().find((o) => o.id === 'friend')!.dialogue![0].choices[0].next).toBeUndefined();
  await click('删除这个选项', host.querySelector('.dialogue-page')!);
  expect(all().find((o) => o.id === 'friend')!.dialogue![0].choices).toEqual([]);
});

it('connects a dialogue condition to a placed item by clicking the map', async () => {
  const canvas = await start();
  await click('狐狸的树屋');
  await click('钥匙');
  await cell(canvas, 6, 3);
  const key = all().find((o) => o.kind === 'key' && o.x === 6 && o.y === 3)!;
  await click('选择 / 移动');
  await cell(canvas, 8, 5);
  await click('在地图选择条件', host.querySelector('.dialogue-page')!);
  await cell(canvas, 6, 3);
  expect(all().find((o) => o.id === 'friend')!.dialogue![0].condition!.sources).toContain(key.id);
  await click('在地图选择条件', host.querySelector('.dialogue-page')!);
  await cell(canvas, 6, 3);
  expect(all().find((o) => o.id === 'friend')!.dialogue![0].condition!.sources).not.toContain(
    key.id,
  );
});

it('keeps a valid picture when a decoration returns to its default appearance', async () => {
  const canvas = await start();
  await click('花');
  await cell(canvas, 4, 3);
  await click('选择 / 移动');
  await cell(canvas, 4, 3);
  await field('物体外形', '');
  const picture = Array.from(canvas.querySelectorAll('image')).find(
    (el) => el.getAttribute('x') === '160' && el.getAttribute('y') === '120',
  )!;
  expect(picture.getAttribute('href')).toBe('/art/storybook-v1/tree.svg');
});
