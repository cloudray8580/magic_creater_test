import { afterEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DrawingBoard } from '../../src/client/DrawingBoard.js';
let root: Root, host: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
});
async function start(save = vi.fn(async (_image: Blob) => {})) {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(DrawingBoard, { onSave: save })));
  const canvas = host.querySelector('canvas')!;
  vi.spyOn(canvas, 'setPointerCapture').mockImplementation(() => {});
  vi.spyOn(canvas, 'hasPointerCapture').mockReturnValue(false);
  return { canvas, save };
}
async function click(text: string) {
  await act(async () =>
    Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent === text)!
      .click(),
  );
}
async function point(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
  const b = canvas.getBoundingClientRect();
  await act(async () =>
    canvas.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        button: 0,
        clientX: b.left + x,
        clientY: b.top + y,
      }),
    ),
  );
}
const pixel = (c: HTMLCanvasElement) =>
  Array.from(c.getContext('2d')!.getImageData(40, 40, 1, 1).data);
it('draws actual transparent PNGs, erases, undoes and cancels a stroke', async () => {
  const { canvas, save } = await start();
  await click('把画作用到这里');
  expect(host.textContent).toContain('先画一点');
  expect(save).not.toHaveBeenCalled();
  await point(canvas, 'pointerdown', 40, 40);
  await point(canvas, 'pointermove', 80, 40);
  await point(canvas, 'pointerup', 80, 40);
  expect(pixel(canvas)[3]).toBe(255);
  const drawn = canvas.toDataURL();
  await click('使用橡皮');
  await point(canvas, 'pointerdown', 40, 40);
  await point(canvas, 'pointerup', 40, 40);
  expect(pixel(canvas)[3]).toBe(0);
  await click('撤销一笔');
  expect(canvas.toDataURL()).toBe(drawn);
  await click('清空画板');
  expect(pixel(canvas)[3]).toBe(0);
  await click('撤销一笔');
  expect(canvas.toDataURL()).toBe(drawn);
  await point(canvas, 'pointerdown', 40, 40);
  await point(canvas, 'pointercancel', 40, 40);
  expect(canvas.toDataURL()).toBe(drawn);
  await click('把画作用到这里');
  await expect.poll(() => save.mock.calls.length).toBe(1);
  expect(save.mock.calls[0][0].type).toBe('image/png');
});
it('preserves the drawing after upload failure and accepts a later retry', async () => {
  const save = vi.fn(async (_image: Blob): Promise<void> => {
    throw new Error('图片额度已满');
  });
  const { canvas } = await start(save);
  await point(canvas, 'pointerdown', 40, 40);
  await point(canvas, 'pointerup', 40, 40);
  const before = canvas.toDataURL();
  await click('把画作用到这里');
  await expect.poll(() => host.textContent).toContain('图片额度已满');
  expect(canvas.toDataURL()).toBe(before);
  save.mockImplementation(async () => {});
  await click('把画作用到这里');
  await expect.poll(() => save.mock.calls.length).toBe(2);
});
