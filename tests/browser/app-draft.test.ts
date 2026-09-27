import { afterEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../../src/client/App.js';
import {
  adventureTemplate,
  TEMPLATE_IDS,
  TEMPLATE_INFO,
} from '../../src/shared/adventure/templates.js';
import type { Project } from '../../src/client/api.js';
const mock = vi.hoisted(() => ({
  api: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  hold: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
}));
vi.mock('../../src/client/api.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: mock.api,
}));
vi.mock('../../src/client/drafts.js', async (original) => ({
  ...(await original<object>()),
  migrateDraft: async () => {},
  readDraft: mock.read,
  writeDraft: mock.write,
  holdDraft: mock.hold,
  removeDraft: mock.remove,
  listLocalDrafts: mock.list,
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
  mock.remove.mockResolvedValue(undefined);
  mock.list.mockResolvedValue([]);
  mock.hold.mockResolvedValue(() => {});
  mock.api.mockImplementation(
    async (
      url: string,
      method = 'GET',
      body?: { document: Project['document']; revision: number },
    ) => {
      const summary = url.includes('?summary=1');
      url = url.split('?')[0];
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
          : {
              projects: [
                summary
                  ? {
                      ...project,
                      document: {
                        title: project.document.title,
                        schemaVersion: project.document.schemaVersion,
                      },
                    }
                  : project,
              ],
            };
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

it('imports raw and portable files through the atomic import endpoint', async () => {
  await start();
  await click('我的作品');
  const doc = adventureTemplate();
  doc.title = '从文件来的世界';
  const original = mock.api.getMockImplementation()!;
  mock.api.mockImplementation(async (url, method, body) =>
    url === '/projects/import'
      ? { ...project, id: 'imported', document: doc }
      : original(url, method, body),
  );
  const files = new DataTransfer();
  files.items.add(new File([JSON.stringify(doc)], 'world.json', { type: 'application/json' }));
  const input = host.querySelector('input[type=file]') as HTMLInputElement;
  input.files = files.files;
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
  });
  await expect.poll(() => mock.api.mock.calls.some((c) => c[0] === '/projects/import')).toBe(true);
  expect(mock.api).toHaveBeenCalledWith('/projects/import', 'POST', { bundle: doc });
  await expect.poll(() => host.textContent).toContain('从文件来的世界');
});

it('keeps saving and image upload from racing while allowing the upload to finish into the draft', async () => {
  await start();
  const original = mock.api.getMockImplementation()!;
  let finish: ((asset: unknown) => void) | undefined;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const asset = {
    id: 'app-upload-image',
    name: '我的图片',
    data: canvas.toDataURL().split(',')[1],
  };
  mock.api.mockImplementation(async (url, method, body) => {
    if (url === '/assets')
      return method === 'POST'
        ? new Promise((r) => {
            finish = r;
          })
        : { assets: [] };
    return original(url, method, body);
  });
  await click('自己的图片与涂鸦');
  const input = host.querySelector('input[type=file]') as HTMLInputElement;
  const files = new DataTransfer();
  files.items.add(new File(['testimage'], 'art.png', { type: 'image/png' }));
  input.files = files.files;
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  await expect.poll(() => Boolean(finish)).toBe(true);
  const toggle = Array.from(host.querySelectorAll('button')).find(
    (b) => b.textContent === '自己的图片与涂鸦',
  )!;
  expect(toggle.disabled).toBe(true);
  await act(async () => {
    toggle.click();
    toggle.click();
  });
  expect(mock.api.mock.calls.filter((c) => c[0] === '/assets' && c[1] !== 'POST')).toHaveLength(1);
  await click('保存到服务器');
  expect(mock.api.mock.calls.some((c) => c[1] === 'PUT')).toBe(false);
  expect(host.textContent).toContain('图片正在处理');
  await act(async () => {
    finish!(asset);
    await new Promise((r) => setTimeout(r, 50));
  });
  await expect
    .poll(() =>
      Array.from(host.querySelectorAll('select')).some((s) => s.value === 'asset:' + asset.id),
    )
    .toBe(true);
  await click('保存到服务器');
  expect(mock.api).toHaveBeenCalledWith(
    '/projects/p',
    'PUT',
    expect.objectContaining({
      document: expect.objectContaining({
        hero: expect.objectContaining({ skin: 'asset:' + asset.id }),
      }),
    }),
  );
});

it('selects all six starting documents and previews without creating a project', async () => {
  await start();
  await click('我的作品');
  expect(host.querySelectorAll('.template-group')).toHaveLength(2);
  expect(host.querySelectorAll('.template-card img')).toHaveLength(6);
  for (const id of TEMPLATE_IDS) {
    const title = TEMPLATE_INFO[id].title;
    const before = mock.api.mock.calls.filter((c) => c[1] === 'POST').length;
    await act(async () =>
      (host.querySelector('[aria-label="先玩一玩' + title + '"]') as HTMLButtonElement).click(),
    );
    expect(host.querySelector('.sample-picker .active')?.textContent).toContain(title);
    expect(mock.api.mock.calls.filter((c) => c[1] === 'POST')).toHaveLength(before);
    await click('我的作品');
    await act(async () =>
      (host.querySelector('[aria-label="开始创作' + title + '"]') as HTMLButtonElement).click(),
    );
    expect(mock.api.mock.calls.filter((c) => c[1] === 'POST')).toHaveLength(before);
    expect(host.querySelector('.section-heading h1')?.textContent).toBe(title);
    await click('我的作品');
  }
});

it('opens an untouched template without creating, keeps edits locally, and creates on explicit first save', async () => {
  await start();
  await click('我的作品');
  const create = () =>
    act(async () =>
      (host.querySelector('[aria-label="开始创作云间邮差"]') as HTMLButtonElement).click(),
    );
  await create();
  expect(mock.api.mock.calls.some((c) => c[1] === 'POST')).toBe(false);
  expect(mock.write).not.toHaveBeenCalled();
  await click('我的作品');
  await create();
  await title('我第一次创作');
  expect(mock.write).toHaveBeenLastCalledWith(
    'u',
    expect.stringMatching(/^local:/),
    expect.objectContaining({
      local: true,
      dirty: true,
      document: expect.objectContaining({ title: '我第一次创作' }),
    }),
  );
  await click('保存到服务器');
  expect(mock.api).toHaveBeenCalledWith(
    '/projects',
    'POST',
    expect.objectContaining({
      creationKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      document: expect.objectContaining({ title: '我第一次创作' }),
    }),
  );
  expect(
    mock.api.mock.calls.filter(([url, method]) => url === '/projects' && method === 'POST'),
  ).toHaveLength(1);
});
it('requires explicit irreversible deletion confirmation and preserves work on cancel or server failure', async () => {
  await start();
  await click('我的作品');
  await click('删除作品');
  expect(host.querySelector('dialog')?.textContent).toContain('无法在应用中恢复');
  await click('取消');
  expect(mock.api.mock.calls.some((c) => c[1] === 'DELETE')).toBe(false);
  const prior = mock.api.getMockImplementation()!;
  mock.api.mockImplementation(async (url, method, body) => {
    if (method === 'DELETE') throw new Error('删除失败，请重试');
    return prior(url, method, body);
  });
  await click('删除作品');
  await click('永久删除');
  expect(host.textContent).toContain('删除失败，请重试');
  expect(mock.remove).not.toHaveBeenCalled();
  expect(host.querySelectorAll('.cards .card')).toHaveLength(1);
});

it('retains a visible maintenance warning after server save succeeds but IndexedDB fails', async () => {
  await start();
  await title('内存中的稿');
  mock.write.mockRejectedValueOnce(new Error('quota'));
  await click('保存到服务器');
  expect(host.textContent).toContain('本地草稿维护失败');
});
it('keeps an orphaned server draft accessible for rescue and blocks saving to its deleted identity', async () => {
  await start();
  const draft = {
    document: { ...project.document, title: '保留我的改稿' },
    revision: 2,
    dirty: true,
  };
  mock.list.mockResolvedValue([{ id: 'gone', draft }]);
  mock.read.mockResolvedValue(draft);
  await click('我的作品');
  const rescue = Array.from(host.querySelectorAll('article.card')).find((card) =>
    card.textContent?.includes('保留我的改稿'),
  )!;
  expect(rescue.textContent).toContain('原作品已删除');
  await act(async () => (rescue.querySelector('button') as HTMLButtonElement).click());
  expect(
    Array.from(host.querySelectorAll('label'))
      .find((l) => l.textContent === '作品名称')
      ?.querySelector('input')?.value,
  ).toBe('保留我的改稿');
  await click('保存到服务器');
  expect(host.textContent).toContain('原作品已删除');
  expect(mock.api.mock.calls.some((c) => c[0] === '/projects/gone')).toBe(false);
});

it('keeps a changed remix setting pending when a first-save retry returns the earlier setting', async () => {
  await start();
  await click('我的作品');
  await act(async () =>
    (host.querySelector('[aria-label="开始创作云间邮差"]') as HTMLButtonElement).click(),
  );
  const checkbox = Array.from(host.querySelectorAll('label'))
    .find((l) => l.textContent?.includes('保存并允许同伴改编'))!
    .querySelector('input')!;
  await act(async () => checkbox.click());
  expect(host.textContent).toContain('你的选择尚未上传');
  expect(checkbox.checked).toBe(true);
  await click('保存到服务器');
  expect(mock.api).toHaveBeenLastCalledWith(
    '/projects/p',
    'PUT',
    expect.objectContaining({ allowRemix: true }),
  );
});

it('blocks submitting a retry when its server remix permission differs from the visible selection', async () => {
  await start();
  await click('我的作品');
  await act(async () =>
    (host.querySelector('[aria-label="开始创作云间邮差"]') as HTMLButtonElement).click(),
  );
  const original = mock.api.getMockImplementation()!;
  mock.api.mockImplementation(async (url, method, body) =>
    url === '/projects' && method === 'POST'
      ? { ...project, document: body.document, allowRemix: true }
      : original(url, method, body),
  );
  await click('提交给老师');
  expect(host.textContent).toContain('改编设置与当前选择不同');
  expect(mock.api.mock.calls.some((c) => c[0].endsWith('/submit'))).toBe(false);
});
