import { it, expect } from 'vitest';
import { composeCharacter } from '../../src/client/character.js';
it('changes visible Canvas pixels for tint and accessories while retaining transparent margins', () => {
  const original = document.createElement('canvas');
  original.width = 128;
  original.height = 160;
  const ctx = original.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(32, 32, 64, 128);
  const normal = composeCharacter(original, '#ffffff', 'none'),
    colored = composeCharacter(original, '#ff0000', 'none');
  const pixel = (c: HTMLCanvasElement, x: number, y: number) =>
    Array.from(c.getContext('2d')!.getImageData(x, y, 1, 1).data);
  expect(pixel(normal, 128, 150)).toEqual([255, 255, 255, 255]);
  expect(pixel(colored, 128, 150)).toEqual([255, 0, 0, 255]);
  expect(pixel(colored, 0, 0)[3]).toBe(0);
  expect(normal.toDataURL()).not.toBe(composeCharacter(original, '#ffffff', 'scarf').toDataURL());
  expect(normal.toDataURL()).not.toBe(composeCharacter(original, '#ffffff', 'hat').toDataURL());
});
