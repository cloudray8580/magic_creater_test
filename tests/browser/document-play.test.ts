import { afterEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DocumentPlay } from '../../src/client/DocumentPlay.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { template } from '../../src/shared/game.js';
const seen = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock('../../src/client/AdventurePlay.js', () => ({
  AdventurePlay: (props: unknown) => {
    seen.play(props);
    return '绘本运行器';
  },
}));
let root: Root, host: HTMLDivElement;
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  seen.play.mockClear();
});
async function render(
  doc: Parameters<typeof DocumentPlay>[0]['document'],
  from?: Parameters<typeof DocumentPlay>[0]['from'],
) {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(DocumentPlay, { document: doc, from })));
}
it('dispatches legacy and adventure while rejecting corrupt playable documents', async () => {
  await render(template());
  expect(host.querySelector('[aria-label="向右"]')).toBeTruthy();
  expect(seen.play).not.toHaveBeenCalled();
  await act(async () =>
    root.render(createElement(DocumentPlay, { document: adventureTemplate() })),
  );
  expect(host.textContent).toBe('绘本运行器');
  const invalid = adventureTemplate();
  invalid.rooms = [];
  await act(async () => root.render(createElement(DocumentPlay, { document: invalid })));
  expect(host.querySelector('[role="alert"]')).toBeTruthy();
});
it('previews a valid selected location without overwriting the draft original start', async () => {
  const doc = adventureTemplate();
  doc.start = null;
  const from = { roomId: 'trail', x: 2, y: 13 };
  await render(doc, from);
  expect(host.textContent).toBe('绘本运行器');
  expect(seen.play.mock.lastCall![0].document.start).toEqual(from);
  expect(seen.play.mock.lastCall![0].from).toEqual(from);
  expect(doc.start).toBeNull();
  const first = seen.play.mock.lastCall![0].document;
  await act(async () => root.render(createElement(DocumentPlay, { document: doc, from })));
  expect(seen.play.mock.lastCall![0].document).toBe(first);
});
