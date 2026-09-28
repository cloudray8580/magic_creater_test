import { afterEach, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SnowmanMap } from '../../src/client/SnowmanMap.js';
import { SnowmanEditor } from '../../src/client/SnowmanEditor.js';
import { DocumentPlay } from '../../src/client/DocumentPlay.js';
import { snowmanTemplate } from '../../src/shared/snowman/template.js';
import type { SnowmanDocument } from '../../src/shared/snowman/document.js';
import type { TimedAction } from '../../src/shared/snowman/engine.js';
let root: Root, host: HTMLDivElement;
async function mount(component: Parameters<Root['render']>[0]) {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  host.style.width = '1200px';
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(component));
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
});
async function click(text: string) {
  const b = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  expect(b, text).toBeTruthy();
  await act(async () => b!.click());
}
async function cell(x: number, y: number) {
  const svg = host.querySelector('[aria-label="雪地地图"]')!;
  const b = svg.getBoundingClientRect();
  for (const type of ['pointerdown', 'pointerup'])
    await act(async () =>
      svg.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          clientX: b.left + (x + 0.5) * 40,
          clientY: b.top + (y + 0.5) * 40,
          button: 0,
          pointerId: 1,
        }),
      ),
    );
}
it('editor paints layered hats, snowballs, shade, endpoints and history controls', async () => {
  let d = snowmanTemplate(),
    undos = 0,
    redos = 0;
  const render = () =>
    createElement(SnowmanEditor, {
      document: d,
      onChange: (v: SnowmanDocument) => {
        d = v;
        root.render(render());
      },
      onUndo: () => undos++,
      onRedo: () => redos++,
      canUndo: true,
      canRedo: true,
    });
  await mount(render());
  await click('树荫');
  await cell(1, 1);
  await click('星星帽');
  await cell(1, 1);
  expect(d.cells.find((c) => c.x === 1 && c.y === 1)?.kind).toBe('shade');
  expect(d.pickups.find((p) => p.x === 1 && p.y === 1)).toEqual({
    x: 1,
    y: 1,
    kind: 'hat',
    style: 'star',
  });
  await click('补给雪球');
  await cell(1, 1);
  expect(d.pickups.find((p) => p.x === 1 && p.y === 1)?.kind).toBe('snowball');
  await click('温暖的家');
  await cell(1, 1);
  expect(d.home).toEqual({ x: 1, y: 1 });
  await click('橡皮擦');
  await cell(1, 1);
  expect(d.home).toBeNull();
  await click('撤销');
  await click('重做');
  expect([undos, redos]).toEqual([1, 1]);
  const zoom = host.querySelector('[aria-label="地图缩放"]') as HTMLSelectElement;
  await act(async () => {
    zoom.value = '0.5';
    zoom.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(host.querySelector('[aria-label="雪地地图"]')!.getAttribute('width')).toBe('560');
});
it('runtime accepts a bridge during movement and reports a replayable win', async () => {
  const d = snowmanTemplate();
  d.width = 8;
  d.height = 8;
  d.start = { x: 0, y: 1 };
  d.home = { x: 2, y: 1 };
  d.cells = [
    { x: 0, y: 1, kind: 'road' },
    { x: 1, y: 1, kind: 'gap' },
    { x: 2, y: 1, kind: 'road' },
  ];
  d.pickups = [{ x: 2, y: 1, kind: 'hat', style: 'wool' }];
  d.preparationSeconds = 0;
  d.mass = 5;
  d.materials = { wood: 2, water: 0, signs: 0, snowballs: 0 };
  let proof: TimedAction[] | undefined;
  await mount(createElement(DocumentPlay, { document: d, onSnowWin: (v) => (proof = v) }));
  await click('开始救援');
  await act(async () => new Promise((r) => setTimeout(r, 200)));
  expect(host.textContent).toContain('雪人正在回家');
  await click('架桥 · 2 木');
  await cell(1, 1);
  await act(async () => new Promise((r) => setTimeout(r, 1700)));
  expect(host.textContent).toContain('雪人平安到家了！');
  expect(host.textContent).toContain('带回 1 顶帽子');
  expect(proof).toEqual([
    { tick: expect.any(Number), action: { type: 'place', tool: 'bridge', x: 1, y: 1 } },
  ]);
  await click('观看回放');
  expect(host.textContent).toContain('观看回放');
});

it('normalizes an old snowman draft before rendering editor and play', async () => {
  const legacy = structuredClone(snowmanTemplate()) as unknown as Record<string, unknown>;
  legacy.rulesVersion = 1;
  delete legacy.pickups;
  delete legacy.preparationSeconds;
  (legacy.materials as Record<string, unknown>).snowballs = undefined;
  delete (legacy.materials as Record<string, unknown>).snowballs;
  await mount(createElement(DocumentPlay, { document: legacy as unknown as SnowmanDocument }));
  expect(host.textContent).toContain('默认准备 3 秒');
  expect(host.querySelector('[aria-label="雪地地图"]')).toBeTruthy();
  await act(async () =>
    root.render(
      createElement(SnowmanEditor, {
        document: legacy as unknown as SnowmanDocument,
        onChange: () => {},
        onUndo: () => {},
        onRedo: () => {},
        canUndo: false,
        canRedo: false,
      }),
    ),
  );
  expect(host.textContent).toContain('可用雪球');
});
it('pause disables early departure and freezes the preparation clock', async () => {
  const d = snowmanTemplate();
  await mount(createElement(DocumentPlay, { document: d }));
  await click('开始救援');
  await click('暂停旅程');
  const depart = [...host.querySelectorAll('button')].find((b) => b.textContent === '提前出发')!;
  expect(depart.disabled).toBe(true);
  const clock = host.querySelector('.snow-game .row strong')!.textContent;
  await act(async () => new Promise((r) => setTimeout(r, 180)));
  expect(host.querySelector('.snow-game .row strong')!.textContent).toBe(clock);
  await click('继续旅程');
});
it('keeps manual pan stable and gives a tall visible area for stacked hats at top edge', async () => {
  const d = snowmanTemplate();
  d.width = 128;
  d.start = { x: 0, y: 0 };
  d.home = { x: 127, y: 0 };
  d.cells = Array.from({ length: 128 }, (_, x) => ({ x, y: 0, kind: 'road' }));
  d.pickups = [];
  const styles = Array.from({ length: 16 }, (_, i) => (i % 2 ? 'pine' : 'berry'));
  const frame = { x: 0, y: 0, time: 0, mass: 18, hats: 16, carrot: false, ski: false };
  await mount(createElement(SnowmanMap, { document: d, frame, hatStyles: styles, follow: true }));
  const map = host.querySelector('[aria-label="雪地地图"]') as SVGSVGElement;
  expect(map.viewBox.baseVal.y).toBeLessThan(0);
  expect(host.querySelectorAll('.snow-character [data-hat-style]')).toHaveLength(16);
  const scroller = host.querySelector('.snow-map-scroll') as HTMLDivElement;
  scroller.style.width = '400px';
  scroller.style.overflow = 'auto';
  await act(async () => {
    scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaX: 1200 }));
    scroller.scrollLeft = 1200;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  expect(scroller.scrollLeft).toBeGreaterThan(500);
  await act(async () =>
    root.render(
      createElement(SnowmanMap, {
        document: d,
        frame: { ...frame, x: 1 },
        hatStyles: styles,
        follow: true,
      }),
    ),
  );
  expect(scroller.scrollWidth).toBeGreaterThan(500);
  expect(scroller.scrollLeft).toBeGreaterThan(500);
});
