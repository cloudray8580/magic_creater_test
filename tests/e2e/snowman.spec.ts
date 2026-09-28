import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { test, expect, type Page } from '@playwright/test';
import { snowmanTemplate } from '../../src/shared/snowman/template.js';
import { login } from './helpers.js';

async function cell(p: Page, x: number, y: number) {
  const map = p.getByRole('application', { name: '雪地地图' });
  await map.scrollIntoViewIfNeeded();
  await map.evaluate(
    (el, p) => {
      const view = el.parentElement!;
      view.scrollLeft = Math.max(0, p.x * 40 - view.clientWidth / 2);
      view.scrollTop = Math.max(0, p.y * 40 - view.clientHeight / 2);
    },
    { x, y },
  );
  const b = (await map.boundingBox())!;
  const size = await map.evaluate((el) => ({
    w: (el as SVGSVGElement).viewBox.baseVal.width,
    h: (el as SVGSVGElement).viewBox.baseVal.height,
  }));
  await p.mouse.click(
    b.x + ((x + 0.5) * 40 * b.width) / size.w,
    b.y + ((y + 0.5) * 40 * b.height) / size.h,
  );
}
async function solve(p: Page) {
  await p.getByRole('button', { name: '开始救援' }).click();
  await p.getByRole('button', { name: '滑雪板 · 2 木' }).click();
  await cell(p, 2, 8);
  await p.getByRole('button', { name: '修路 · 1 木' }).click();
  await cell(p, 10, 8);
  await expect(p.getByText('雪人正在回家')).toBeVisible({ timeout: 6000 });
  await p.getByRole('button', { name: '灭火 · 1 水' }).click();
  await cell(p, 14, 8);
  await expect(p.getByRole('heading', { name: '雪人平安到家了！' })).toBeVisible({
    timeout: 20000,
  });
}

test('snowman author edit, timed live rescue, approval, peer play, feedback, export', async ({
  browser,
}) => {
  test.setTimeout(80000);
  const t = await browser.newPage(),
    a = await browser.newPage(),
    b = await browser.newPage();
  const errors: string[] = [];
  for (const p of [t, a, b]) p.on('pageerror', (e) => errors.push(e.message));
  await login(t, 'teacher');
  await t.getByRole('button', { name: '老师管理', exact: true }).click();
  for (const name of ['snowauthor', 'snowpeer']) {
    await t.getByLabel('学生账号').fill(name);
    await t.getByLabel('学生昵称').fill(name);
    await t.getByLabel('初始密码').fill('test-password-123');
    await t.getByRole('button', { name: '添加学生' }).click();
    await expect(t.getByText(name + ' · ' + name)).toBeVisible();
  }
  await login(a, 'snowauthor');
  await a.getByRole('button', { name: '开始创作雪人回家', exact: true }).click();
  await a.getByLabel('作品名称').fill('送小雪回家');
  await a.getByLabel('作品名称').press('Tab');
  await a.getByLabel('地图宽度').fill('128');
  await a.getByLabel('地图宽度').press('Tab');
  await a.getByLabel('地图高度').fill('128');
  await a.getByLabel('地图高度').press('Tab');
  await a.getByRole('button', { name: /星星帽/ }).click();
  await cell(a, 126, 126);
  await a.getByRole('button', { name: '撤销', exact: true }).click();
  await a.getByRole('button', { name: '重做', exact: true }).click();
  await a.getByRole('button', { name: '提交给老师', exact: true }).click();
  await expect(a.getByRole('alert')).toContainText('请先试玩');
  await a.getByRole('button', { name: '试玩关卡', exact: true }).click();
  await solve(a);
  await a.screenshot({ path: 'artifacts/m11-author-home.png', fullPage: true });
  await a.getByRole('button', { name: '返回编辑', exact: true }).click();
  await a.getByRole('button', { name: '保存到服务器', exact: true }).click();
  await expect(a.getByText('已保存到服务器', { exact: true })).toBeVisible();
  await a.getByRole('button', { name: '提交给老师', exact: true }).click();
  await expect(a.getByText('已提交给老师，等待确认展示')).toBeVisible();
  await t.getByRole('button', { name: '刷新管理页' }).click();
  const review = t.locator('article.review').filter({ hasText: '送小雪回家' });
  await review.getByRole('button', { name: '确认展示' }).click();
  await expect(review.getByText('展示中', { exact: true })).toBeVisible();
  await login(b, 'snowpeer');
  await b.getByRole('button', { name: '同伴作品', exact: true }).click();
  await b
    .locator('article.card')
    .filter({ hasText: '送小雪回家' })
    .getByRole('button', { name: '试玩作品' })
    .click();
  await solve(b);
  await b.getByLabel('给创作者的反馈').fill('路上继续修桥和灭火，小雪终于回家了！');
  await b.getByRole('button', { name: '送出反馈' }).click();
  await expect(b.getByText('反馈已送出，谢谢你的发现')).toBeVisible();
  await a.getByRole('button', { name: '刷新版本与反馈' }).click();
  await expect(a.getByText('路上继续修桥和灭火，小雪终于回家了！')).toBeVisible();
  const downloadPromise = a.waitForEvent('download');
  await a.getByRole('button', { name: '导出当前草稿', exact: true }).click();
  const downloaded = await downloadPromise;
  const payload = JSON.parse(readFileSync((await downloaded.path())!, 'utf8'));
  const exported = payload.document ?? payload;
  expect(exported.schemaVersion).toBe(3);
  expect(exported.rulesVersion).toBe(2);
  expect(exported.width).toBe(128);
  expect(exported.pickups).toContainEqual({ x: 126, y: 126, kind: 'hat', style: 'star' });
  await a.getByRole('button', { name: '提交给老师', exact: true }).click();
  expect(errors).toEqual([]);
  await Promise.all([t.close(), a.close(), b.close()]);
});

test('sample supports a real time snowball, then replays the successful journey', async ({
  page,
}) => {
  test.setTimeout(50000);
  await login(page, 'teacher');
  await page.getByRole('button', { name: '先玩一玩雪人回家', exact: true }).click();
  await page.getByRole('button', { name: '开始救援' }).click();
  await page.getByRole('button', { name: '滑雪板 · 2 木' }).click();
  await cell(page, 2, 8);
  await expect(page.getByText('雪人正在回家')).toBeVisible({ timeout: 6000 });
  await page.getByRole('button', { name: '修路 · 1 木' }).click();
  await cell(page, 10, 8);
  await page.getByRole('button', { name: '雪球 · 1 个' }).click();
  await cell(page, 12, 8);
  await page.getByRole('button', { name: '灭火 · 1 水' }).click();
  await cell(page, 14, 8);
  await expect(page.getByLabel('剩余材料')).toContainText('雪球 1');
  await expect(page.getByRole('heading', { name: '雪人平安到家了！' })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('button', { name: '观看回放' }).click();
  await page.getByLabel('回放速度').selectOption('4');
  await expect(page.getByRole('heading', { name: '雪人平安到家了！' })).toBeVisible({
    timeout: 10000,
  });
  await page.locator('.snow-map-wrap').screenshot({ path: 'artifacts/m11-live-map.png' });
});

test('legacy snowman project upgrades on open, saves, and submits its solved route', async ({
  browser,
}) => {
  test.setTimeout(80000);
  const teacher = await browser.newPage();
  const student = await browser.newPage();
  await login(teacher, 'teacher');
  await teacher.getByRole('button', { name: '老师管理', exact: true }).click();
  await teacher.getByLabel('学生账号').fill('snowlegacy');
  await teacher.getByLabel('学生昵称').fill('snowlegacy');
  await teacher.getByLabel('初始密码').fill('test-password-123');
  await teacher.getByRole('button', { name: '添加学生' }).click();
  await expect(teacher.getByText('snowlegacy · snowlegacy')).toBeVisible();
  await login(student, 'snowlegacy');
  const template = snowmanTemplate();
  const created = await student.request.post('/api/projects', {
    data: { document: template },
    headers: { origin: 'http://127.0.0.1:4273' },
  });
  expect(created.ok()).toBe(true);
  const { id } = (await created.json()) as { id: string };
  const { pickups: _pickups, preparationSeconds: _prep, materials, ...rest } = template;
  const old = {
    ...rest,
    rulesVersion: 1,
    title: '旧版雪人回家',
    cells: rest.cells.map((item) =>
      item.x === 16 && item.y === 4 ? { ...item, kind: 'hat' } : item,
    ),
    materials: { wood: materials.wood, water: materials.water, signs: materials.signs },
  };
  const db = new Database(readFileSync('artifacts/e2e-db-path', 'utf8'));
  db.prepare('UPDATE projects SET document=? WHERE id=?').run(JSON.stringify(old), id);
  db.close();
  await student.reload();
  await student
    .locator('article.card')
    .filter({ hasText: '旧版雪人回家' })
    .getByRole('button', { name: '继续创作' })
    .click();
  await expect(student.getByText('旧版雪人作品已升级，请试玩并保存')).toBeVisible();
  await student.getByRole('button', { name: '试玩关卡', exact: true }).click();
  await solve(student);
  await student.getByRole('button', { name: '返回编辑', exact: true }).click();
  await student.getByRole('button', { name: '保存到服务器', exact: true }).click();
  await expect(student.getByText('已保存到服务器', { exact: true })).toBeVisible();
  await student.getByRole('button', { name: '提交给老师', exact: true }).click();
  await expect(student.getByText('已提交给老师，等待确认展示')).toBeVisible();
  await teacher.close();
  await student.close();
});
