import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AdventureEditor } from '../src/client/AdventureEditor.js';
import { adventureTemplate } from '../src/shared/adventure/templates.js';
import { PLATFORM_LIMITS, validateAdventure } from '../src/shared/adventure/document.js';
import { paintWorld } from '../src/shared/adventure/editor.js';
import { createHistory, changeHistory } from '../src/shared/game.js';
import { writeDraft, readDraft, removeDraft } from '../src/client/drafts.js';
import { mountAdventure } from '../src/client/adventure/renderer.js';
import '../src/client/style.css';
export async function benchmark(kind: 'empty' | 'sparse' | 'dense') {
  const d = adventureTemplate(),
    r = d.rooms[0];
  r.width = PLATFORM_LIMITS.width;
  r.height = 64;
  d.start = { roomId: r.id, x: 2, y: 46 };
  r.tiles =
    kind === 'empty'
      ? []
      : Array.from({ length: 8192 }, (_, i) => ({
          x: i % r.width,
          y: 64 - Math.ceil(8192 / r.width) + Math.floor(i / r.width),
          kind: 'solid' as const,
        }));
  r.objects = [
    {
      id: 'goal',
      kind: 'goal',
      x: r.width - 3,
      y: 46,
      condition: { mode: 'all', sources: [] },
      ending: '旅程完成',
    },
  ];
  if (kind !== 'empty')
    for (let i = 0; i < 299; i++)
      r.objects.push(
        kind === 'dense'
          ? {
              id: 'mover-' + i,
              kind: 'mover',
              x: 10 + (i % 12),
              y: 28 + Math.floor(i / 12),
              route: { x: 28 + (i % 12), y: 28 + Math.floor(i / 12) },
              width: 2,
              speed: 'fast',
            }
          : { id: 'flower-' + i, kind: 'decoration', skin: 'flower', x: (i * 17) % r.width, y: 46 },
      );
  validateAdventure(d);
  document.querySelector('#root')?.remove();
  const host = document.createElement('div');
  host.style.width = '1440px';
  document.body.append(host);
  const root = createRoot(host);
  let h = createHistory(d);
  const draw = () =>
    flushSync(() =>
      root.render(
        createElement(AdventureEditor, {
          onPreviewFrom: () => {},

          document: h.present,
          onChange: (doc) => {
            h = changeHistory(h, doc);
            draw();
          },
          onUndo: () => {},
          onRedo: () => {},
          canUndo: false,
          canRedo: false,
        }),
      ),
    );
  const tick = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const memory = () =>
    ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ??
      0) / 1048576;
  const start = performance.now();
  draw();
  await tick();
  const openMs = performance.now() - start;
  const scroll = host.querySelector('.editor-scroll') as HTMLDivElement;
  scroll.scrollTo(0, 63 * 40 * 0.9 - scroll.clientHeight / 2);
  scroll.scrollIntoView({ block: 'nearest' });
  await tick();
  await tick();
  // Include local persistence and a paint-ready browser frame in each editing sample.
  const user = 'benchmark-' + crypto.randomUUID(),
    project = 'local:' + crypto.randomUUID(),
    edits: number[] = [];
  let peakMiB = memory();
  for (let i = 0; i < 100; i++) {
    scroll.scrollLeft = (i % r.width) * 40 * 0.9 - scroll.clientWidth / 2;
    await tick();
    await tick();
    const before = performance.now();
    h = changeHistory(
      h,
      paintWorld(h.present, r.id, [{ x: i % r.width, y: 63 }], 'water', 'terrain'),
    );
    draw();
    await writeDraft(user, project, { document: h.present, revision: 1, dirty: true, local: true });
    await tick();
    edits.push(performance.now() - before);
    if (!host.querySelector('.world-canvas > image[x="' + (i % r.width) * 40 + '"][y="2520"]'))
      throw Error('paint target not rendered');
    peakMiB = Math.max(peakMiB, memory());
  }
  const t = performance.now();
  await writeDraft(user, project, { document: h.present, revision: 1, dirty: true, local: true });
  const saveMs = performance.now() - t;
  const u = performance.now();
  const restored = await readDraft(user, project);
  const restoreMs = performance.now() - u;
  if (JSON.stringify(restored?.document) !== JSON.stringify(h.present))
    throw Error('draft mismatch');
  const distinctTiles = new Set([...h.past, h.present].flatMap((doc) => doc.rooms[0].tiles)).size;
  root.unmount();
  host.remove();
  await removeDraft(user, project);
  const play = document.createElement('div');
  Object.assign(play.style, { width: '960px', height: '576px' });
  document.body.append(play);
  const errors: string[] = [];
  let ready = false;
  const game = mountAdventure(play, d, {
    onFrame: () => {
      ready = true;
    },
    onError: (e) => errors.push(e),
  });
  for (let i = 0; !ready && i < 300; i++) await tick();
  if (!ready) throw Error('game not ready');
  game.pause(false);
  game.key('ArrowRight', true);
  const frames: number[] = [];
  let previous = performance.now();
  for (let i = 0; i < 180; i++) {
    await tick();
    const current = performance.now();
    if (i > 30) frames.push(current - previous);
    previous = current;
    peakMiB = Math.max(peakMiB, memory());
  }
  game.destroy();
  play.remove();
  await tick();
  if (errors.length) throw Error(errors.join(';'));
  const percentile = (values: number[], p: number) =>
    [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
  return {
    kind,
    width: r.width,
    height: r.height,
    tiles: r.tiles.length,
    objects: r.objects.length,
    openMs,
    saveMs,
    restoreMs,
    editP50Ms: percentile(edits, 0.5),
    editP95Ms: percentile(edits, 0.95),
    frameP50Ms: percentile(frames, 0.5),
    frameP95Ms: percentile(frames, 0.95),
    meanFps: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
    heapSamplePeakMiB: peakMiB,
    historySteps: h.past.length,
    distinctTiles,
    documentBytes: new TextEncoder().encode(JSON.stringify(h.present)).length,
  };
}
