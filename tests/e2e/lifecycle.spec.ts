import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { test, expect } from '@playwright/test';
import { login } from './helpers.js';
test('empty account, local recovery, idempotent first save, cross-tab lock and confirmed permanent deletion', async ({
  browser,
}) => {
  const teacher = await browser.newPage();
  await login(teacher, 'teacher');
  const name = 'lifecycle' + Date.now();
  expect(
    (
      await teacher.request.post('/api/members', {
        headers: { origin: 'http://127.0.0.1:4273' },
        data: { username: name, displayName: '小画家', password: 'test-password-123' },
      })
    ).status(),
  ).toBe(201);
  const context = await browser.newContext(),
    page = await context.newPage();
  await login(page, name);
  const cards = page.locator('.cards article');
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: '开始创作云间邮差', exact: true }).click();
  await page.getByRole('button', { name: '我的作品', exact: true }).click();
  await expect(cards).toHaveCount(0);
  expect((await (await page.request.get('/api/projects')).json()).projects).toHaveLength(0);
  await page.getByRole('button', { name: '开始创作云间邮差', exact: true }).click();
  await page.getByLabel('作品名称').fill('可恢复的草稿');
  await expect(page.getByText('本地草稿已保存', { exact: false })).toBeVisible();
  await page.reload();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('未同步草稿');
  await cards.getByRole('button', { name: '继续创作' }).click();
  await expect(page.getByLabel('作品名称')).toHaveValue('可恢复的草稿');
  let first = true;
  await page.route('**/api/projects', async (route) => {
    if (first && route.request().method() === 'POST') {
      first = false;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole('button', { name: '保存到服务器' }).click();
  await expect(page.getByRole('alert')).toContainText('连接');
  await page.getByLabel('作品名称').fill('雨后的邮局');
  await page.getByRole('button', { name: '保存到服务器' }).click();
  await expect(page.getByText(/此前保存的版本/)).toBeVisible();
  await expect(page.getByLabel('作品名称')).toHaveValue('雨后的邮局');
  await page.getByRole('button', { name: '保存到服务器' }).click();
  await expect(page.getByText('已保存到服务器', { exact: true })).toBeVisible();
  const stored = (await (await page.request.get('/api/projects')).json()).projects;
  expect(stored).toHaveLength(1);
  expect(stored[0].document.title).toBe('雨后的邮局');
  await page.getByRole('button', { name: '我的作品', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await cards.getByRole('button', { name: /删除/ }).click();
  await expect(page.getByRole('dialog')).toContainText('无法');
  await expect(page.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(cards).toHaveCount(1);
  const other = await context.newPage();
  await other.goto('/');
  await other.locator('.cards article').getByRole('button', { name: '继续创作' }).click();
  await cards.getByRole('button', { name: /删除/ }).click();
  await page.getByRole('button', { name: '永久删除', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('另一个标签');
  await other.close();
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fetch();
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'truncated' });
    } else await route.continue();
  });
  await cards.getByRole('button', { name: /删除/ }).click();
  await page.getByRole('button', { name: '永久删除', exact: true }).click();
  await expect(page.getByText('作品已永久删除', { exact: true })).toBeVisible();
  await expect(cards).toHaveCount(0);
  expect((await page.request.get('/api/projects/' + stored[0].id)).status()).toBe(404);
  await page.reload();
  await expect(cards).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/m8-empty-worlds.png', fullPage: true });
  await context.close();
  await teacher.close();
});
test('a stale tab cannot save its local creation into the account now logged in elsewhere', async ({
  browser,
}) => {
  const context = await browser.newContext(),
    a = await context.newPage();
  await login(a, 'teacher');
  const name = 'switch' + Date.now();
  expect(
    (
      await a.request.post('/api/members', {
        headers: { origin: 'http://127.0.0.1:4273' },
        data: { username: name, displayName: '新账号', password: 'test-password-123' },
      })
    ).status(),
  ).toBe(201);
  await a.getByRole('button', { name: '开始创作云间邮差', exact: true }).click();
  await a.getByLabel('作品名称').fill('原账号的草稿');
  await expect(a.getByText('本地草稿已保存', { exact: false })).toBeVisible();
  const b = await context.newPage();
  await b.goto('/');
  await b.getByRole('button', { name: '退出登录' }).click();
  await login(b, name);
  await a.getByRole('button', { name: '保存到服务器' }).click();
  await expect(a.getByRole('alert')).toContainText('其他标签');
  await expect(a.getByRole('button', { name: '进入工坊' })).toBeVisible();
  expect((await (await b.request.get('/api/projects')).json()).projects).toHaveLength(0);
  const preserved = await a.evaluate(
    () =>
      new Promise<boolean>((resolve, reject) => {
        const r = indexedDB.open('magic-creater-drafts', 1);
        r.onsuccess = () => {
          const db = r.result,
            q = db.transaction('drafts').objectStore('drafts').getAll();
          q.onsuccess = () => {
            resolve(q.result.some((d) => d.document.title === '原账号的草稿'));
            db.close();
          };
          q.onerror = () => reject(q.error);
        };
      }),
  );
  expect(preserved).toBe(true);
  await context.close();
});

test('a committed import whose response is lost can be retried without duplicating the world', async ({
  browser,
}) => {
  const teacher = await browser.newPage();
  await login(teacher, 'teacher');
  const name = 'importretry' + Date.now();
  expect(
    (
      await teacher.request.post('/api/members', {
        headers: { origin: 'http://127.0.0.1:4273' },
        data: { username: name, displayName: '重试验证', password: 'test-password-123' },
      })
    ).status(),
  ).toBe(201);
  const context = await browser.newContext(),
    page = await context.newPage();
  await login(page, name);
  let lose = true;
  await page.route('**/api/projects/import', async (route) => {
    if (lose) {
      lose = false;
      expect((await route.fetch()).status()).toBe(201);
      await route.abort('failed');
    } else await route.continue();
  });
  const document = adventureTemplate();
  document.title = '网络重试只创建一次';
  const input = {
    name: 'world.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  };
  await page.getByLabel('导入作品', { exact: true }).setInputFiles(input);
  await expect(
    page.getByText('连接暂时不可用。已打开的作品仍可编辑，请导出或等待网络恢复后保存。', {
      exact: true,
    }),
  ).toBeVisible();
  expect((await (await page.request.get('/api/projects')).json()).projects).toHaveLength(1);
  await page.getByLabel('导入作品', { exact: true }).setInputFiles(input);
  await expect(page.getByLabel('作品名称')).toHaveValue(document.title);
  expect((await (await page.request.get('/api/projects')).json()).projects).toHaveLength(1);
  await page.getByRole('button', { name: '我的作品', exact: true }).click();
  await page.getByLabel('导入作品', { exact: true }).setInputFiles(input);
  await expect(page.getByLabel('作品名称')).toHaveValue(document.title);
  expect((await (await page.request.get('/api/projects')).json()).projects).toHaveLength(2);
  await context.close();
  await teacher.close();
});
