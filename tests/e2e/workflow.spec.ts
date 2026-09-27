import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers.js';
test('teacher, two creators, review, play, feedback and withdrawal', async ({ browser }) => {
  const t = await browser.newPage(),
    a = await browser.newPage(),
    b = await browser.newPage();
  await login(t, 'teacher');
  await t.getByRole('button', { name: '老师管理', exact: true }).click();
  for (const name of ['alice', 'bob']) {
    await t.getByLabel('学生账号').fill(name);
    await t.getByLabel('学生昵称').fill(name);
    await t.getByLabel('初始密码').fill('test-password-123');
    await t.getByRole('button', { name: '添加学生' }).click();
    await expect(t.getByText(name + ' · ' + name)).toBeVisible();
  }
  await login(a, 'alice');
  await a.getByText('经典格子玩法与作品导入', { exact: true }).click();
  await a.getByRole('button', { name: '从月光花园开始' }).click();
  await a.getByLabel('作品名称').fill('我的第一座花园');
  await a.getByRole('button', { name: '橡皮擦', exact: true }).click();
  // A clear top/right route, no collectibles: deterministic user-authored playable level.
  for (const xy of ['3,0', '5,0', '2,3']) await a.getByTestId('cell-' + xy).click();
  await a.getByRole('button', { name: '保存到服务器' }).click();
  await expect(a.getByRole('status')).toContainText('已保存到服务器');
  await a.getByRole('button', { name: '提交给老师' }).click();
  await expect(a.getByRole('status')).toContainText('已提交给老师');
  await t.getByRole('button', { name: '刷新管理页' }).click();
  await t.getByRole('button', { name: '确认展示' }).click();
  await expect(t.getByText('展示中', { exact: true })).toBeVisible();
  await login(b, 'bob');
  await b.getByRole('button', { name: '同伴作品', exact: true }).click();
  await b.getByRole('button', { name: '试玩作品' }).click();
  for (let i = 0; i < 5; i++) await b.getByRole('button', { name: '向右', exact: true }).click();
  for (let i = 0; i < 5; i++) await b.getByRole('button', { name: '向下', exact: true }).click();
  await expect(b.getByText('你完成了这个小世界！')).toBeVisible();
  await b.getByLabel('给创作者的反馈').fill('我喜欢这条温柔的小路');
  await b.getByRole('button', { name: '送出反馈' }).click();
  await expect(b.getByRole('status')).toContainText('反馈已送出');
  await a.getByRole('button', { name: '刷新版本与反馈' }).click();
  await expect(a.getByText('我喜欢这条温柔的小路')).toBeVisible();
  await expect(a.getByText('对应修订 1', { exact: false })).toBeVisible();
  await a.getByLabel('作品名称').fill('收到反馈后的花园');
  await a.getByRole('button', { name: '保存到服务器' }).click();
  await t.getByRole('button', { name: '刷新管理页' }).click();
  await a.getByRole('button', { name: '提交给老师' }).click();
  await t.getByRole('button', { name: '刷新管理页' }).click();
  await t.getByRole('button', { name: '确认展示' }).click();
  await t
    .locator('article.review')
    .filter({ hasText: '我喜欢这条温柔的小路' })
    .getByRole('button', { name: '隐藏反馈' })
    .click();
  await a.getByRole('button', { name: '刷新版本与反馈' }).click();
  await expect(a.getByText('我喜欢这条温柔的小路')).toHaveCount(0);
  await a.evaluate(() =>
    Object.defineProperty(indexedDB, 'open', {
      value() {
        throw new Error('storage unavailable');
      },
    }),
  );
  await a.getByLabel('作品名称').fill('仅在内存中的草稿');
  await expect(a.getByText('本地保存失败，请立即导出文件', { exact: false })).toBeVisible();
  await a.getByRole('button', { name: '试玩修订 1', exact: true }).click();
  await expect(a.getByRole('heading', { name: '我的第一座花园', exact: true })).toBeVisible();
  await a.getByRole('button', { name: '返回编辑作品' }).click();
  await expect(a.getByLabel('作品名称')).toHaveValue('仅在内存中的草稿');
  await t.getByRole('button', { name: '撤回展示' }).click();
  await b.getByRole('button', { name: '同伴作品', exact: true }).click();
  await expect(b.getByText('还没有展示中的作品')).toBeVisible();
  await a.screenshot({ path: 'artifacts/editor.png', fullPage: true });
  await t.close();
  await a.close();
  await b.close();
});

test('offline drafts, history, JSON roundtrip and revision conflict preserve work', async ({
  browser,
}) => {
  const t = await browser.newPage();
  await login(t, 'teacher');
  await t.getByRole('button', { name: '老师管理', exact: true }).click();
  await t.getByLabel('学生账号').fill('draftuser');
  await t.getByLabel('学生昵称').fill('草稿同学');
  await t.getByLabel('初始密码').fill('test-password-123');
  await t.getByRole('button', { name: '添加学生' }).click();
  await expect(t.getByText('草稿同学 · draftuser')).toBeVisible();
  const context = await browser.newContext(),
    p = await context.newPage();
  await login(p, 'draftuser');
  await p.getByText('经典格子玩法与作品导入', { exact: true }).click();
  await p.getByRole('button', { name: '从转角的礼物开始' }).click();
  await p.getByLabel('作品名称').fill('离线前');
  await p.getByRole('button', { name: '保存到服务器' }).click();
  await expect(p.getByRole('status')).toContainText('已保存到服务器');
  const blocked = await context.newPage();
  await blocked.goto('/');
  await blocked.getByRole('button', { name: '继续创作' }).click();
  await expect(blocked.getByRole('alert')).toContainText('另一个标签');
  await blocked.close();
  const otherContext = await browser.newContext({ storageState: await context.storageState() });
  const other = await otherContext.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: '继续创作' }).click();
  await expect(other.getByLabel('作品名称')).toHaveValue('离线前');
  await context.setOffline(true);
  await p.getByLabel('作品名称').fill('离线的灵感');
  await expect(p.getByText('本地草稿已保存', { exact: false })).toBeVisible();
  await p.getByRole('button', { name: '花朵', exact: true }).click();
  await p.getByTestId('cell-0,1').click();
  await expect(p.getByTestId('cell-0,1')).toContainText('✿');
  await p.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(p.getByTestId('cell-0,1')).toHaveText('');
  await p.getByRole('button', { name: '重做', exact: true }).click();
  await expect(p.getByTestId('cell-0,1')).toContainText('✿');
  await p.getByRole('button', { name: '保存到服务器' }).click();
  await expect(p.getByRole('alert')).toContainText('连接暂时不可用');
  await context.setOffline(false);
  await p.reload();
  await p.getByRole('button', { name: '继续创作' }).click();
  await expect(p.getByLabel('作品名称')).toHaveValue('离线的灵感');
  await expect(p.getByTestId('cell-0,1')).toContainText('✿');
  await other.getByRole('button', { name: '保存到服务器' }).click();
  await expect(other.getByRole('status')).toContainText('已保存到服务器');
  await p.reload();
  await p.getByRole('button', { name: '继续创作' }).click();
  await expect(p.getByLabel('作品名称')).toHaveValue('离线的灵感');
  await other.getByLabel('作品名称').fill('另一页已保存');
  await other.getByRole('button', { name: '保存到服务器' }).click();
  await expect(other.getByRole('status')).toContainText('已保存到服务器');
  await p.getByLabel('作品名称').fill('冲突仍保留的灵感');
  await p.getByRole('button', { name: '保存到服务器' }).click();
  await expect(p.getByRole('alert')).toContainText('其他页面已保存了新版本');
  await expect(p.getByLabel('作品名称')).toHaveValue('冲突仍保留的灵感');
  const downloadPromise = p.waitForEvent('download');
  await p.getByRole('button', { name: '导出当前草稿' }).click();
  const download = await downloadPromise;
  const file = await download.path();
  await p.getByRole('button', { name: '我的作品', exact: true }).click();
  await p.getByLabel('导入作品', { exact: true }).setInputFiles(file!);
  await expect(p.getByLabel('作品名称')).toHaveValue('冲突仍保留的灵感');
  await p.getByRole('button', { name: '另存副本', exact: true }).click();
  await expect(p.getByLabel('作品名称')).toHaveValue('冲突仍保留的灵感 副本');
  await p.getByRole('button', { name: '我的作品', exact: true }).click();
  await p.getByLabel('导入作品', { exact: true }).setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":99}'),
  });
  await expect(p.getByRole('alert')).toContainText('不支持的作品版本');
  await p.setViewportSize({ width: 390, height: 844 });
  await expect(p.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await otherContext.close();
  await context.close();
  await t.close();
});

test('account switching clears privileged cached feedback even when storage and history fail', async ({
  browser,
}) => {
  const p = await browser.newPage();
  await login(p, 'teacher');
  const headers = { origin: 'http://127.0.0.1:4273' };
  expect(
    (
      await p.request.post('/api/members', {
        headers,
        data: { username: 'switchuser', displayName: '切换同学', password: 'test-password-123' },
      })
    ).status(),
  ).toBe(201);
  const source = (
    await p.request.post('/api/projects', {
      headers,
      data: {
        document: {
          schemaVersion: 1,
          rulesVersion: 1,
          gameType: 'grid-exploration',
          assetPack: 'builtin-basic-v1',
          title: '老师的作品',
          level: {
            width: 4,
            height: 4,
            objects: [
              { id: 's', type: 'spawn', x: 0, y: 0 },
              { id: 'g', type: 'goal', x: 3, y: 3 },
            ],
          },
          goal: { type: 'collect-all-and-reach-goal' },
        },
      },
    })
  ).json();
  const project = await source;
  const version = await (
    await p.request.post('/api/projects/' + project.id + '/submit', {
      headers,
      data: { revision: 1 },
    })
  ).json();
  await p.request.patch('/api/versions/' + version.id, { headers, data: { status: 'approved' } });
  const feedback = await (
    await p.request.post('/api/versions/' + version.id + '/feedback', {
      headers,
      data: { text: '仅老师可见的反馈' },
    })
  ).json();
  await p.request.patch('/api/feedback/' + feedback.id, { headers, data: { hidden: true } });
  await p.getByRole('button', { name: '老师管理', exact: true }).click();
  await expect(p.getByText('仅老师可见的反馈')).toBeVisible();
  await p.getByRole('button', { name: '退出登录' }).click();
  // Same document/session in the browser, no reload: reproduce stale React state.
  await p.getByLabel('账号', { exact: true }).fill('switchuser');
  await p.getByLabel('密码', { exact: true }).fill('test-password-123');
  await p.getByRole('button', { name: '进入工坊' }).click();
  await p.route('**/api/projects/*/feedback', (route) => route.abort());
  await p.evaluate(() =>
    Object.defineProperty(indexedDB, 'open', {
      value() {
        throw new Error('storage unavailable');
      },
    }),
  );
  await p.getByText('经典格子玩法与作品导入', { exact: true }).click();
  await p.getByRole('button', { name: '从月光花园开始' }).click();
  // Opening a temporary template no longer requests server history.
  await expect(p.getByRole('alert')).toHaveCount(0);
  await expect(p.getByText('仅老师可见的反馈')).toHaveCount(0);
  await expect(p.getByText('本地存储不可用，请及时导出', { exact: false })).toBeVisible();
  await p.close();
});
