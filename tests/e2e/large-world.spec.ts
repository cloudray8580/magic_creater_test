import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
import { PLATFORM_LIMITS } from '../../src/shared/adventure/document.js';
import { login } from './helpers.js';
test('maximum world can edit far away, save, recover, play, export and import using summary lists', async ({
  page,
}) => {
  test.setTimeout(90000);
  await login(page, 'teacher');
  const d = adventureTemplate(),
    r = d.rooms[0];
  d.title = '最大地图验证';
  r.width = PLATFORM_LIMITS.width;
  r.height = 64;
  d.start = { roomId: r.id, x: 2, y: 62 };
  r.tiles = Array.from({ length: PLATFORM_LIMITS.tiles }, (_, i) => ({
    x: i % r.width,
    y: 64 - Math.ceil(PLATFORM_LIMITS.tiles / r.width) + Math.floor(i / r.width),
    kind: 'solid' as const,
  }));
  // A playable air corridor at y=62 is impossible with full lower rows; use start above the fill.
  d.start.y = 64 - Math.ceil(PLATFORM_LIMITS.tiles / r.width) - 2;
  r.objects = [
    {
      id: 'goal',
      kind: 'goal',
      x: r.width - 3,
      y: d.start.y,
      condition: { mode: 'all', sources: [] },
      ending: '完成',
    },
  ];
  for (let i = 0; i < PLATFORM_LIMITS.objects - 1; i++)
    r.objects.push({
      id: 'flower-' + i,
      kind: 'decoration',
      skin: 'flower',
      x: (i * 7) % r.width,
      y: d.start.y,
    });
  const created = await page.request.post('/api/projects', {
    headers: { origin: 'http://127.0.0.1:4273' },
    data: { document: d },
  });
  expect(created.ok()).toBe(true);
  const p = await created.json();
  await page.reload();
  const summary = await page.request.get('/api/projects?summary=1');
  expect(
    (await summary.json()).projects.find((x: { id: string }) => x.id === p.id).document.rooms,
  ).toBeUndefined();
  await page
    .locator('.cards article')
    .filter({ hasText: d.title })
    .getByRole('button', { name: '继续创作' })
    .click();
  await expect(page.getByRole('button', { name: '向右扩展64格' })).toBeDisabled();
  await page.getByRole('button', { name: '定位终点', exact: true }).click();
  await expect
    .poll(() => page.locator('.editor-scroll').evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(r.width * 30);
  const imageCount = await page.locator('.world-canvas > image').count();
  expect(imageCount).toBeLessThan(1500);
  await page.getByRole('button', { name: '水面', exact: true }).click();
  await page.locator('.editor-scroll').scrollIntoViewIfNeeded();
  const map = page.getByRole('application', { name: '关卡画布' });
  const point = await map.evaluate(
    (el, cell) => {
      const b = el.getBoundingClientRect(),
        v = (el as SVGSVGElement).viewBox.baseVal;
      return {
        x: b.x + (((cell.x + 0.5) * 40) / v.width) * b.width,
        y: b.y + (((cell.y + 0.5) * 40) / v.height) * b.height,
      };
    },
    { x: r.width - 5, y: 64 - Math.ceil(PLATFORM_LIMITS.tiles / r.width) },
  );
  await page.mouse.click(point.x, point.y);
  await page.getByRole('button', { name: '保存到服务器' }).click();
  await expect(page.getByText('已保存到服务器', { exact: true })).toBeVisible();
  const full = (await (await page.request.get('/api/projects/' + p.id)).json()).document;
  expect(
    full.rooms[0].tiles.find(
      (t: { x: number; y: number }) =>
        t.x === r.width - 5 && t.y === 64 - Math.ceil(PLATFORM_LIMITS.tiles / r.width),
    ).kind,
  ).toBe('water');
  await page.getByLabel('作品名称').fill('大地图本地恢复');
  await expect(page.getByText('本地草稿已保存', { exact: false })).toBeVisible();
  await page.reload();
  await page
    .locator('.cards article')
    .filter({ hasText: d.title })
    .getByRole('button', { name: '继续创作' })
    .click();
  await expect(page.getByLabel('作品名称')).toHaveValue('大地图本地恢复');
  await page.getByRole('button', { name: '试玩关卡', exact: true }).click();
  await page.getByRole('button', { name: '点击进入小世界' }).click();
  await expect(page.locator('.game-stage canvas')).toBeVisible();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  await page.getByRole('button', { name: '返回编辑', exact: true }).click();
  await page.getByRole('button', { name: '保存到服务器' }).click();
  await expect(page.getByText('已保存到服务器', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '我的作品', exact: true }).click();
  const card = page.locator('.cards article').filter({ hasText: '大地图本地恢复' });
  const dl = page.waitForEvent('download');
  await card.getByRole('button', { name: '导出', exact: true }).click();
  const path = await (await dl).path();
  const exported = JSON.parse(await readFile(path!, 'utf8'));
  expect(exported.rooms[0].width).toBe(r.width);
  expect(exported.rooms[0].tiles).toHaveLength(PLATFORM_LIMITS.tiles);
  await page.getByLabel('导入作品', { exact: true }).setInputFiles({
    name: 'world.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.getByLabel('作品名称')).toHaveValue('大地图本地恢复');
  await expect(page.getByRole('button', { name: '向右扩展64格' })).toBeDisabled();
});
