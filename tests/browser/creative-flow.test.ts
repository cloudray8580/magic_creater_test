import { afterEach, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../../src/client/App.js';
import { FeedbackMap } from '../../src/client/FeedbackMap.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { template } from '../../src/shared/game.js';
import type { Project, Version } from '../../src/client/api.js';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../src/client/api.js', async (original) => ({
  ...(await original<object>()),
  api: mocks.api,
}));
vi.mock('../../src/client/drafts.js', async (original) => ({
  ...(await original<object>()),
  migrateDraft: async () => {},
  readDraft: async () => undefined,
  writeDraft: async () => {},
  holdDraft: async () => () => {},
  removeDraft: async () => {},
  listLocalDrafts: async () => [],
}));
vi.mock('../../src/client/AdventurePlay.js', () => ({
  AdventurePlay: ({ onLocation }: { onLocation?: (where: unknown) => void }) =>
    createElement(
      'button',
      { onClick: () => onLocation?.({ roomId: 'garden', x: 3, y: 8 }) },
      '模拟走到来信处',
    ),
}));
let root: Root, host: HTMLDivElement, project: Project, version: Version;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});
async function click(name: string) {
  const button = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === name)!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
}
async function setField(label: string, value: string) {
  const el = Array.from(host.querySelectorAll('label'))
    .find((l) => l.firstChild?.textContent === label)!
    .querySelector('input,textarea') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function start() {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const source = {
    versionId: 'original',
    title: '原作的来信',
    authorName: '另一位同学',
    verified: true,
  };
  project = {
    id: 'p',
    ownerId: 'u',
    revision: 1,
    updatedAt: 1,
    document: adventureTemplate('forest-letter'),
    source,
    allowRemix: false,
  };
  version = {
    id: 'v',
    projectId: 'p',
    sourceRevision: 1,
    document: structuredClone(project.document),
    status: 'approved',
    reviewNote: '',
    authorName: '作者',
    source,
    allowRemix: true,
  };
  mocks.api.mockImplementation(
    async (url: string, method: string = 'GET', body?: Record<string, unknown>) => {
      const summary = url.includes('?summary=1');
      url = url.split('?')[0];
      if (url === '/me')
        return {
          user: { id: 'u', role: 'student', username: 'author', displayName: '作者', active: true },
          classroom: { name: '小组' },
        };
      if (url === '/projects')
        return {
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
          project = {
            ...project,
            document: body!.document as Project['document'],
            allowRemix: body!.allowRemix as boolean,
            revision: project.revision + 1,
          };
        return project;
      }
      if (url === '/projects/p/copy')
        return {
          ...project,
          id: 'copy',
          document: { ...(body!.document as Project['document']), title: '新改稿 副本' },
        };
      if (url === '/versions/v/remix') return { ...project, id: 'remix', allowRemix: false };
      if (url.endsWith('/versions'))
        return {
          versions: [
            summary
              ? {
                  ...version,
                  document: {
                    title: version.document.title,
                    schemaVersion: version.document.schemaVersion,
                  },
                }
              : version,
          ],
        };
      if (url === '/versions/v') return version;
      if (url === '/versions/v/feedback') return { ok: true };
      if (url.endsWith('/feedback'))
        return {
          feedback: [
            {
              id: 'f',
              versionId: 'v',
              text: '来信的位置很有趣',
              authorName: '同伴',
              title: version.document.title,
              location: { roomId: 'garden', x: 3, y: 8 },
            },
          ],
        };
      throw new Error('unexpected ' + url);
    },
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(App)));
  await click('继续创作');
}
it('saves opt-in with the current revision, preserves source on copy and shows the frozen feedback map', async () => {
  await start();
  expect(host.textContent).toContain('改编自：另一位同学的《原作的来信》');
  await setField('房间名称', '后来改稿的名字');
  const checkbox = Array.from(host.querySelectorAll('label'))
    .find((l) => l.textContent === '保存并允许同伴改编')!
    .querySelector('input')!;
  await act(async () => checkbox.click());
  expect(mocks.api).toHaveBeenCalledWith(
    '/projects/p',
    'PUT',
    expect.objectContaining({ revision: 1, allowRemix: true }),
  );
  expect(checkbox.checked).toBe(true);
  await click('查看反馈位置');
  expect(host.querySelector('.feedback-map figcaption')?.textContent).toContain('林间花园');
  expect(host.querySelector('.feedback-map figcaption')?.textContent).not.toContain('后来改稿');
  expect(host.querySelector('.feedback-map svg')?.getAttribute('aria-label')).toContain('3,8');
  await click('关闭位置示意');
  await setField('作品名称', '新改稿');
  await click('另存副本');
  expect(mocks.api).toHaveBeenCalledWith(
    '/projects/p/copy',
    'POST',
    expect.objectContaining({ document: expect.objectContaining({ title: '新改稿' }) }),
  );
  expect(host.textContent).toContain('改编自：另一位同学的《原作的来信》');
});
it('only sends a location after explicit capture and clears it after feedback submission', async () => {
  await start();
  await click('试玩修订 1');
  await click('模拟走到来信处');
  await setField('给创作者的反馈', '没有附位置的反馈');
  await click('送出反馈');
  expect(mocks.api).toHaveBeenCalledWith('/versions/v/feedback', 'POST', {
    text: '没有附位置的反馈',
  });
  await click('记录当前位置');
  expect(host.textContent).toContain('格 3,8');
  await setField('给创作者的反馈', '这里的来信');
  await click('送出反馈');
  expect(mocks.api).toHaveBeenCalledWith('/versions/v/feedback', 'POST', {
    text: '这里的来信',
    location: { roomId: 'garden', x: 3, y: 8 },
  });
  expect(host.textContent).not.toContain('已记录：');
  await click('记录当前位置');
  await click('不附带位置');
  expect(host.textContent).not.toContain('已记录：');
  await click('改编这个作品');
  expect(mocks.api).toHaveBeenCalledWith('/versions/v/remix', 'POST', {
    creationKey: expect.any(String),
  });
});
it('shows unsupported locations without borrowing a different document room', async () => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(FeedbackMap, {
        document: template(),
        location: { roomId: 'garden', x: 3, y: 8 },
      }),
    ),
  );
  expect(host.textContent).toContain('没有对应的房间');
});
