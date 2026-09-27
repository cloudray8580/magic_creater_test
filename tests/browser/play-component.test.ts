import { afterEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AdventurePlay } from '../../src/client/AdventurePlay.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { frameStory } from '../../src/client/adventure/view.js';
import { startStory } from '../../src/shared/adventure/story.js';
const mock = vi.hoisted(() => ({
  controls: {
    key: vi.fn(),
    action: vi.fn(),
    pause: vi.fn(),
    sound: vi.fn(),
    motion: vi.fn(),
    destroy: vi.fn(),
  },
  release: undefined as (() => void) | undefined,
}));
vi.mock('../../src/client/adventure/renderer.js', async () => {
  await new Promise<void>((resolve) => {
    mock.release = resolve;
  });
  return {
    mountAdventure: (
      _host: HTMLElement,
      doc: Parameters<typeof startStory>[0],
      options: { onFrame: (frame: ReturnType<typeof frameStory>) => void },
    ) => {
      options.onFrame(frameStory(startStory(doc)));
      return mock.controls;
    },
  };
});
let root: Root, host: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  localStorage.clear();
  vi.clearAllMocks();
});
it('keeps a playable entry after clicking during lazy load, scopes keyboard input and releases resources', async () => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(createElement(AdventurePlay, { document: adventureTemplate('forest-letter') })),
  );
  expect(host.textContent).toContain('正在打开小世界');
  await act(async () =>
    host
      .querySelector('.game-stage')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })),
  );
  await expect.poll(() => Boolean(mock.release)).toBe(true);
  await act(async () => {
    mock.release!();
    await new Promise((r) => setTimeout(r, 100));
  });
  const buttons = () => Array.from(host.querySelectorAll('button'));
  expect(buttons().some((b) => b.textContent === '点击进入小世界')).toBe(true);
  await act(async () =>
    buttons()
      .find((b) => b.textContent === '点击进入小世界')!
      .click(),
  );
  expect(mock.controls.pause).toHaveBeenLastCalledWith(false);
  const surface = host.querySelector('section')!;
  await act(async () => {
    surface.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
    surface.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', bubbles: true }));
  });
  expect(mock.controls.key).toHaveBeenCalledWith('ArrowRight', true);
  expect(mock.controls.key).toHaveBeenCalledWith('ArrowRight', false);
  mock.controls.key.mockClear();
  await act(async () => {
    const button = buttons().find((b) => b.textContent === '重新开始')!;
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
  });
  expect(mock.controls.key).not.toHaveBeenCalled();
  expect(mock.controls.pause).toHaveBeenLastCalledWith(true);
  await act(async () =>
    buttons()
      .find((b) => b.textContent === '撤销一步')!
      .click(),
  );
  expect(mock.controls.action).toHaveBeenCalledWith('undo', undefined);
  await act(async () => {
    const music = host.querySelectorAll('input')[0] as HTMLInputElement;
    music.click();
  });
  expect(localStorage.getItem('world-music')).toBe('true');
  expect(mock.controls.sound).toHaveBeenLastCalledWith(true, true);
  await act(async () => window.dispatchEvent(new Event('blur')));
  expect(mock.controls.pause).toHaveBeenLastCalledWith(true);
  await act(async () => root.unmount());
  expect(mock.controls.destroy).toHaveBeenCalledOnce();
});
