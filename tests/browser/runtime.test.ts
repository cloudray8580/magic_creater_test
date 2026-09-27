import { afterEach, describe, expect, it } from 'vitest';
import { mountAdventure, type GameControls } from '../../src/client/adventure/renderer.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import type { GameFrame } from '../../src/client/adventure/view.js';
let controls: GameControls | undefined;
let host: HTMLDivElement;
afterEach(async () => {
  controls?.destroy();
  controls = undefined;
  await new Promise((r) => setTimeout(r, 50));
  host?.remove();
});
function start(kind: 'cloud-post' | 'forest-letter' = 'cloud-post') {
  host = document.createElement('div');
  Object.assign(host.style, { width: '960px', height: '576px' });
  document.body.append(host);
  let frame: GameFrame | undefined;
  const errors: string[] = [];
  controls = mountAdventure(host, adventureTemplate(kind), {
    onFrame: (f) => {
      frame = f;
    },
    onError: (e) => errors.push(e),
  });
  return { frame: () => frame!, errors };
}
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
describe('isolated browser runtime adapter, no application server or database', () => {
  it('preserves a tap between render frames, pauses, and destroys its canvas', async () => {
    const view = start();
    controls!.pause(false);
    controls!.action('restart');
    expect(view.frame()).toBeUndefined(); // No ready frame before Phaser finishes preload.
    await expect.poll(() => view.frame()?.room.id).toBe('trail');
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    controls!.key('ArrowRight', true);
    await delay(100);
    expect(view.frame().hero.x).toBeCloseTo(2.5);
    controls!.pause(false);
    await delay(500);
    controls!.key('Space', true);
    controls!.pause(true);
    controls!.pause(false);
    await delay(180);
    expect(view.frame().hero.y).toBe(14);
    controls!.key('Space', true);
    controls!.key('Space', false);
    await expect.poll(() => view.frame().hero.y).toBeLessThan(13.5);
    controls!.pause(true);
    const y = view.frame().hero.y;
    await delay(250);
    expect(view.frame().hero.y).toBe(y);
    controls!.pause(false);
    controls!.motion(false);
    await expect.poll(() => view.frame().hero.y).toBe(14);
    controls!.key('KeyE', true);
    controls!.key('KeyE', false);
    await expect.poll(() => view.frame().dialogue?.text).toContain('空格跳跃');
    controls!.action('close');
    expect(view.frame().dialogue).toBeNull();
    controls!.action('respawn');
    expect(view.frame().deaths).toBe(1);
    controls!.action('restart');
    expect(view.frame().deaths).toBe(0);
    controls!.destroy();
    controls = undefined;
    await expect.poll(() => host.querySelectorAll('canvas').length).toBe(0);
    expect(view.errors).toEqual([]);
  });
  it('supports single-tap story movement, inventory undo, room reset and dialog close', async () => {
    const view = start('forest-letter');
    await expect.poll(() => view.frame()?.room.id).toBe('garden');
    controls!.pause(false);
    const tap = (key: string) => {
      controls!.key(key, true);
      controls!.key(key, false);
    };
    tap('ArrowDown');
    tap('ArrowRight');
    expect(view.frame().inventory).toEqual(['一封来信']);
    tap('KeyZ');
    expect(view.frame().inventory).toEqual([]);
    tap('KeyR');
    expect(view.frame().hero).toMatchObject({ x: 2.5, y: 8 });
    tap('KeyE');
    expect(view.frame().dialogue?.text).toContain('撤销一步');
    tap('KeyR');
    expect(view.frame().dialogue?.text).toContain('撤销一步');
    tap('KeyZ');
    expect(view.frame().dialogue?.text).toContain('撤销一步');
    controls!.action('close');
    expect(view.frame().dialogue).toBeNull();
    controls!.action('restart');
    controls!.motion(true);
    await delay(100);
    expect(view.errors).toEqual([]);
  });
});

it('renders uploaded images and hero tint as actual Canvas pixels in both game modes', async () => {
  for (const kind of ['cloud-post', 'forest-letter'] as const) {
    host = document.createElement('div');
    Object.assign(host.style, { width: '960px', height: '576px' });
    document.body.append(host);
    const image = document.createElement('canvas');
    image.width = image.height = 256;
    const ctx = image.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    const white = image.toDataURL();
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, 0, 256, 256);
    const blue = image.toDataURL();
    const doc = adventureTemplate(kind);
    doc.hero = { skin: 'asset:hero-test', tint: '#ff0000', accessory: 'none' };
    doc.rooms[0].objects.push({
      id: 'personal-decoration',
      kind: 'decoration',
      x: 4,
      y: kind === 'cloud-post' ? 12 : 7,
      skin: 'asset:decor-test',
      width: 2,
      height: 1,
    });
    let ready = false;
    const errors: string[] = [];
    controls = mountAdventure(host, doc, {
      assetUrls: { 'hero-test': white, 'decor-test': blue },
      onFrame: () => {
        ready = true;
      },
      onError: (e) => errors.push(e),
    });
    await expect.poll(() => ready).toBe(true);
    await delay(100);
    const canvas = host.querySelector('canvas')!;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, 960, 576).data;
    let red = 0,
      blueCount = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 255 && pixels[i + 1] === 0 && pixels[i + 2] === 0) red++;
      if (pixels[i] === 0 && pixels[i + 1] === 0 && pixels[i + 2] === 255) blueCount++;
    }
    expect(red).toBeGreaterThan(300);
    expect(blueCount).toBeGreaterThan(300);
    expect(errors).toEqual([]);
    controls.destroy();
    controls = undefined;
    await delay(50);
    host.remove();
  }
});

it('renders cottage, forest and dusk as distinct actual background pixels', async () => {
  const colors: number[][] = [];
  for (const theme of ['forest', 'dusk', 'cottage'] as const) {
    host = document.createElement('div');
    Object.assign(host.style, { width: '960px', height: '576px' });
    document.body.append(host);
    const doc = adventureTemplate();
    doc.theme = theme;
    let ready = false;
    controls = mountAdventure(host, doc, {
      onFrame: () => {
        ready = true;
      },
      onError: () => {},
    });
    await expect.poll(() => ready).toBe(true);
    await delay(100);
    const canvas = host.querySelector('canvas')!;
    colors.push([...canvas.getContext('2d')!.getImageData(40, 40, 1, 1).data]);
    controls.destroy();
    controls = undefined;
    await delay(50);
    host.remove();
  }
  expect(colors[0]).not.toEqual(colors[1]);
  expect(colors[0]).not.toEqual(colors[2]);
  expect(colors[1]).not.toEqual(colors[2]);
  expect(colors.every((c) => c[3] === 255)).toBe(true);
});

for (const kind of ['moving-bridge', 'rooftop-secret'] as const)
  it(
    'finishes the unmodified ' + kind + ' template via normal runtime keyboard controls',
    async () => {
      host = document.createElement('div');
      Object.assign(host.style, { width: '960px', height: '576px' });
      document.body.append(host);
      let f: GameFrame | undefined;
      const errors: string[] = [];
      controls = mountAdventure(host, adventureTemplate(kind), {
        onFrame: (frame) => {
          f = frame;
        },
        onError: (e) => errors.push(e),
      });
      await expect.poll(() => f?.room.id).toBe('trail');
      controls.pause(false);
      await expect.poll(() => f?.hero.y).toBe(14);
      const go = async (target: number, jump = false) => {
        if (jump) controls!.key('Space', true);
        controls!.key('ArrowRight', true);
        await expect
          .poll(() => f!.hero.x, { timeout: 5000, interval: 16 })
          .toBeGreaterThanOrEqual(target - 0.6);
        controls!.key('ArrowRight', false);
        // Keep jump held through ascent; release only after the landing has completed.
        await delay(1400);
        controls!.key('Space', false);
      };
      await go(6.5);
      await go(9.3, true);
      expect(f!.collected).toBe(1);
      expect(f!.hero.y).toBe(11);
      await go(14.3, true);
      expect(f!.collected).toBe(2);
      expect(f!.hero.y).toBe(9);
      if (kind === 'rooftop-secret') {
        await go(17.8);
        await expect
          .poll(() => f!.objects.find((o) => o.id === 'patrol')!.x, { timeout: 9000, interval: 16 })
          .toBeLessThan(20);
      }
      await go(24.3, true);
      controls.key('KeyE', true);
      controls.key('KeyE', false);
      await expect.poll(() => f!.objects.find((o) => o.id === 'gate')?.texture).toBe('door-open');
      await go(27.3, true);
      expect(f!.collected).toBe(3);
      controls.key('ArrowRight', true);
      await expect.poll(() => f!.ending, { timeout: 5000 }).toBeTruthy();
      controls.key('ArrowRight', false);
      expect(f!.deaths).toBe(0);
      expect(errors).toEqual([]);
    },
    40000,
  );

it('keeps the cottage window visible outside the opaque floor of the original story template', async () => {
  host = document.createElement('div');
  Object.assign(host.style, { width: '960px', height: '576px' });
  document.body.append(host);
  let ready = false;
  controls = mountAdventure(host, adventureTemplate('secret-home'), {
    onFrame: () => {
      ready = true;
    },
    onError: () => {},
  });
  await expect.poll(() => ready).toBe(true);
  await delay(100);
  const data = host.querySelector('canvas')!.getContext('2d')!.getImageData(0, 0, 960, 576).data;
  let windowPixels = 0;
  for (let i = 0; i < data.length; i += 4)
    if (data[i] === 153 && data[i + 1] === 189 && data[i + 2] === 181) windowPixels++;
  expect(windowPixels).toBeGreaterThan(400);
});
