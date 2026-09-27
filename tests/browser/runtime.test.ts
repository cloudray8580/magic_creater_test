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
