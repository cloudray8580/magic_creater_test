import { it, expect, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdventureEditor } from '../../src/client/AdventureEditor.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { resizeRoom } from '../../src/shared/adventure/editor.js';
import { createHistory, changeHistory, undoHistory, redoHistory } from '../../src/shared/game.js';
import '../../src/client/style.css';
it('navigates and culls a maximum map, fits an overview and reverses expansion atomically', async () => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const initial = resizeRoom(adventureTemplate(), 'trail', 448, 64);
  initial.rooms[0].tiles = Array.from({ length: 8192 }, (_, i) => ({
    x: i % 448,
    y: 44 + Math.floor(i / 448),
    kind: 'solid' as const,
  }));
  initial.rooms[0].objects.find((o) => o.kind === 'goal')!.x = 440;
  let latest = initial;
  function Harness() {
    const [h, set] = useState(() => createHistory(initial));
    latest = h.present;
    return createElement(AdventureEditor, {
      document: h.present,
      onPreviewFrom: () => {},
      onChange: (d) => set(changeHistory(h, d)),
      onUndo: () => set(undoHistory(h)),
      onRedo: () => set(redoHistory(h)),
      canUndo: !!h.past.length,
      canRedo: !!h.future.length,
    });
  }
  const host = document.createElement('div');
  host.style.width = '1440px';
  document.body.append(host);
  const root = createRoot(host);
  const click = async (name: string) => {
    const b = Array.from(host.querySelectorAll('button')).find(
      (b) => (b.getAttribute('aria-label') ?? b.textContent) === name,
    )!;
    expect(b).toBeTruthy();
    await act(async () => b.click());
  };
  try {
    await act(async () => root.render(createElement(Harness)));
    const scroll = host.querySelector('.editor-scroll') as HTMLDivElement;
    expect(host.querySelectorAll('.world-canvas > image').length).toBeLessThan(1000);
    await click('向右扩展64格');
    expect(latest.rooms[0].width).toBe(512);
    await click('撤销');
    expect(latest.rooms[0].width).toBe(448);
    await click('重做');
    expect(latest.rooms[0].width).toBe(512);
    await click('定位终点');
    await expect.poll(() => scroll.scrollLeft).toBeGreaterThan(14000);
    await click('定位起点');
    await expect.poll(() => scroll.scrollLeft).toBe(0);
    const map = host.querySelector('.world-minimap canvas') as HTMLCanvasElement;
    vi.spyOn(map, 'setPointerCapture').mockImplementation(() => {});
    const b = map.getBoundingClientRect();
    await act(async () =>
      map.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 1,
          clientX: b.left + b.width * 0.86,
          clientY: b.bottom - 2,
        }),
      ),
    );
    await expect.poll(() => scroll.scrollLeft).toBeGreaterThan(14000);
    await expect
      .poll(() => host.querySelectorAll('.world-canvas > image').length)
      .toBeGreaterThan(1);
    expect(host.querySelectorAll('.world-canvas > image').length).toBeLessThan(1000);
    await act(async () =>
      map.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' })),
    );
    await click('缩小地图');
    await new Promise((r) => requestAnimationFrame(r));
    await click('放大地图');
    await new Promise((r) => requestAnimationFrame(r));
    await click('适合窗口');
    await expect.poll(() => scroll.scrollLeft).toBe(0);
    expect(host.querySelectorAll('.world-canvas > image').length).toBeLessThan(10);
    expect(host.querySelectorAll('.world-canvas path').length).toBeGreaterThan(0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  }
});
