import { test, expect } from '@playwright/test';
import { login } from './helpers.js';
import { TEMPLATE_IDS, TEMPLATE_INFO } from '../../src/shared/adventure/templates.js';

test('homepage previews load, each trial opens its own world without creating a project, and classic entry stays usable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page, 'teacher');
  const before = await (await page.request.get('/api/projects')).json();
  const previews = page.locator('.template-card img');
  await expect(previews).toHaveCount(6);
  await expect
    .poll(() =>
      previews.evaluateAll((images) =>
        images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
      ),
    )
    .toBe(true);
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/m7-home-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 1024, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/m7-home-1024.png', fullPage: true });
  for (const id of TEMPLATE_IDS) {
    const title = TEMPLATE_INFO[id].title;
    await page.getByRole('button', { name: '先玩一玩' + title, exact: true }).click();
    await expect(page.locator('.sample-picker .active')).toContainText(title);
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.getByRole('button', { name: '点击进入小世界' }).click();
    await expect(page.locator('.game-coordinate')).toBeVisible();
    await page.getByRole('button', { name: '我的作品', exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
  }
  const after = await (await page.request.get('/api/projects')).json();
  expect(after).toEqual(before);
  await page.getByRole('link', { name: /回到我的小世界/ }).focus();
  await page.keyboard.press('Enter');
  expect(
    await page.locator('#my-worlds').evaluate((el) => el.getBoundingClientRect().top),
  ).toBeLessThan(900);
  await page.getByText('经典格子玩法与作品导入', { exact: true }).click();
  await expect(page.getByRole('button', { name: '从月光花园开始' })).toBeVisible();
  await expect(page.getByLabel('导入作品', { exact: true })).toBeAttached();
  expect(errors).toEqual([]);
});
