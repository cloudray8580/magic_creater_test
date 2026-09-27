import { afterEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../../src/client/App.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import type { Project } from '../../src/client/api.js';
const mock = vi.hoisted(() => ({ api: vi.fn(), read: vi.fn(), write: vi.fn(), hold: vi.fn() }));
vi.mock('../../src/client/api.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: mock.api,
}));
vi.mock('../../src/client/drafts.js', () => ({
  readDraft: mock.read,
  writeDraft: mock.write,
  holdDraft: mock.hold,
}));
vi.mock('../../src/client/AdventurePlay.js', () => ({ AdventurePlay: () => '绘本试玩' }));
let root: Root, host: HTMLDivElement, project: Project;
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
async function start(draft?: unknown) {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  project = { id: 'p', ownerId: 'u', revision: 2, updatedAt: 1, document: adventureTemplate() };
  mock.read.mockResolvedValue(draft);
  mock.write.mockResolvedValue(undefined);
  mock.hold.mockResolvedValue(() => {});
  mock.api.mockImplementation(
    async (
      url: string,
      method = 'GET',
      body?: { document: Project['document']; revision: number },
    ) => {
      if (url === '/me')
        return {
          user: {
            id: 'u',
            username: 'creator',
            displayName: '作者',
            role: 'student',
            active: true,
          },
          classroom: { name: '小组' },
        };
      if (url === '/projects')
        return method === 'POST'
          ? { ...project, document: body!.document }
          : { projects: [project] };
      if (url === '/projects/p') {
        if (method === 'PUT')
          project = { ...project, document: body!.document, revision: project.revision + 1 };
        return project;
      }
      if (url.endsWith('/versions')) return { versions: [] };
      if (url.endsWith('/feedback')) return { feedback: [] };
      throw new Error('Unexpected ' + url);
    },
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(App)));
  await click('继续创作');
}
async function click(name: string) {
  const b = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === name)!;
  expect(b).toBeTruthy();
  await act(async () => b.click());
}
async function title(value: string) {
  const input = Array.from(host.querySelectorAll('label'))
    .find((l) => l.textContent === '作品名称')!
    .querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it.each([
  { document: adventureTemplate(), revision: 2 },
  { document: adventureTemplate(), revision: 2, dirty: null },
  { document: undefined, revision: 2, dirty: true },
  { document: adventureTemplate(), revision: 'corrupt', dirty: true },
])(
  'preserves malformed draft envelopes and prevents autosave from overwriting them',
  async (draft) => {
    await start(draft);
    expect(
      Array.from(host.querySelectorAll('button')).some((b) => b.textContent === '导出未恢复草稿'),
    ).toBe(true);
    await title('保留中的改稿');
    expect(mock.write).not.toHaveBeenCalled();
    await click('保存到服务器');
    expect(mock.api.mock.calls.some((c) => c[1] === 'PUT')).toBe(false);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click('重新加载服务器版本');
    expect(mock.write).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    mock.read.mockResolvedValue(undefined);
    await click('重新加载服务器版本');
    expect(mock.write).toHaveBeenCalledWith(
      'u',
      'p',
      expect.objectContaining({ dirty: false }),
      true,
    );
    expect(host.textContent).not.toContain('导出未恢复草稿');
  },
);
it('restores an unsaved V2 draft, persists edits and previews without discarding the editor', async () => {
  const doc = adventureTemplate();
  doc.title = '恢复中的世界';
  await start({ document: doc, revision: 1, dirty: true });
  expect(host.textContent).toContain('已恢复未保存的本地草稿');
  await title('新的世界');
  expect(mock.write).toHaveBeenLastCalledWith(
    'u',
    'p',
    expect.objectContaining({ revision: 1, dirty: true }),
  );
  const canvas = host.querySelector('svg');
  await click('试玩关卡');
  expect(host.textContent).toContain('绘本试玩');
  await click('返回编辑');
  expect(host.querySelector('svg')).toBe(canvas);
  await click('保存到服务器');
  expect(mock.api).toHaveBeenCalledWith(
    '/projects/p',
    'PUT',
    expect.objectContaining({ revision: 1 }),
  );
  expect(host.textContent).toContain('已保存到服务器');
});

it('exports a large valid map within the same byte limit accepted by import', async () => {
  const doc = adventureTemplate();
  doc.start = null;
  doc.rooms[0].width = 128;
  doc.rooms[0].height = 32;
  doc.rooms[0].tiles = Array.from({ length: 4096 }, (_, i) => ({
    x: i % 128,
    y: Math.floor(i / 128),
    kind: 'solid' as const,
  }));
  await start({ document: doc, revision: 2, dirty: true });
  let saved: Blob | undefined;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    saved = blob as Blob;
    return 'blob:test';
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await click('导出当前草稿');
  expect(saved!.size).toBeLessThanOrEqual(256 * 1024);
  expect(JSON.parse(await saved!.text())).toEqual(doc);
});
